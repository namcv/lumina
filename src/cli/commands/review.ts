import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import pc from 'picocolors';
import { DepGraph } from '../../utils/dep-graph.js';
import type { SourceMapOutput } from '../../generators/graph.js';

interface ReviewFile {
  path: string;       // relative path
  reason: 'changed' | 'impacted';
  type: string;
  complexity: number;
  riskScore: number;
  importedByCount: number;
}

interface MrInfo {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  url: string;
}

async function fetchMrInfo(mrUrl: string): Promise<MrInfo> {
  // GitHub PR: https://github.com/owner/repo/pull/123
  const githubMatch = mrUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (githubMatch) {
    const [, owner, repo, prNumber] = githubMatch;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(apiUrl, { headers });
    if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { head: { ref: string }; base: { ref: string }; title: string; html_url: string };
    return {
      sourceBranch: data.head.ref,
      targetBranch: data.base.ref,
      title: data.title,
      url: data.html_url,
    };
  }

  // GitLab MR: https://gitlab.com/group/project/-/merge_requests/123
  // Also supports self-hosted: https://gitlab.company.com/group/project/-/merge_requests/123
  const gitlabMatch = mrUrl.match(/([^/]+\.[^/]+)\/(.+?)\/-\/merge_requests\/(\d+)/);
  if (gitlabMatch) {
    const [, host, projectPath, mrId] = gitlabMatch;
    const encodedPath = encodeURIComponent(projectPath);
    const apiUrl = `https://${host}/api/v4/projects/${encodedPath}/merge_requests/${mrId}`;
    const headers: Record<string, string> = {};
    const token = process.env.GITLAB_TOKEN;
    if (token) headers['PRIVATE-TOKEN'] = token;

    const res = await fetch(apiUrl, { headers });
    if (!res.ok) throw new Error(`GitLab API error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { source_branch: string; target_branch: string; title: string; web_url: string };
    return {
      sourceBranch: data.source_branch,
      targetBranch: data.target_branch,
      title: data.title,
      url: data.web_url,
    };
  }

  throw new Error(`Unsupported MR/PR URL format. Supported:\n  GitHub: https://github.com/owner/repo/pull/123\n  GitLab: https://gitlab.com/group/project/-/merge_requests/123`);
}

export async function reviewCommand(opts: {
  root?: string;
  base?: string;
  source?: string;
  target?: string;
  mr?: string;
  output?: string;
  json?: boolean;
}): Promise<void> {
  const root = path.resolve(opts.root ?? process.cwd());
  const sourceMapPath = path.join(root, '.claude', 'source-map.json');

  if (!fs.existsSync(sourceMapPath)) {
    console.error(pc.red('✗') + ' source-map.json not found. Run `lumina analyze` first.');
    process.exit(1);
  }

  // Resolve source/target branches
  let sourceBranch: string;
  let targetBranch: string;
  let mrTitle: string | undefined;
  let mrUrl: string | undefined;

  if (opts.mr) {
    console.log(pc.dim(`Fetching MR info from ${opts.mr}...`));
    try {
      const info = await fetchMrInfo(opts.mr);
      sourceBranch = info.sourceBranch;
      targetBranch = info.targetBranch;
      mrTitle = info.title;
      mrUrl = info.url;
      console.log(pc.green('✓') + ` MR: "${mrTitle}"`);
      console.log(pc.dim(`  ${sourceBranch} → ${targetBranch}`));
    } catch (err) {
      console.error(pc.red('✗') + ' ' + (err as Error).message);
      process.exit(1);
    }
  } else if (opts.source && opts.target) {
    sourceBranch = opts.source;
    targetBranch = opts.target;
  } else if (opts.source) {
    // Only source provided — diff source vs HEAD (backwards compat with --base)
    sourceBranch = opts.source;
    targetBranch = 'HEAD';
  } else {
    // Legacy --base flag
    sourceBranch = opts.base ?? 'main';
    targetBranch = 'HEAD';
  }

  // Build git diff command
  // When target is HEAD: git diff source...HEAD (changes from fork point to HEAD)
  // When both specified: git diff target...source (changes in source not in target)
  const diffRef = targetBranch === 'HEAD'
    ? `${sourceBranch}...HEAD`
    : `${targetBranch}...${sourceBranch}`;

  // Get changed files from git diff
  // Try direct ref first, then fallback to origin/ prefix for remote-only branches
  let changedFiles: string[] = [];
  const refsToTry = [diffRef];
  if (targetBranch !== 'HEAD') {
    // Also try with origin/ prefix in case branches are only at remote
    const originDiffRef = `origin/${targetBranch}...origin/${sourceBranch}`;
    if (originDiffRef !== diffRef) refsToTry.push(originDiffRef);
  }

  let succeeded = false;
  for (const ref of refsToTry) {
    try {
      const out = execSync(`git -C "${root}" diff --name-only ${ref}`, {
        encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000,
      });
      changedFiles = out.trim().split('\n').filter(Boolean);
      succeeded = true;
      break;
    } catch { /* try next */ }
  }

  if (!succeeded) {
    console.error(pc.red('✗') + ` Could not run git diff: ${diffRef}`);
    console.error(pc.dim(`  Make sure both branches exist locally or remotely. Try: git fetch origin`));
    process.exit(1);
  }

  if (changedFiles.length === 0) {
    console.log(pc.yellow('⚠ No changed files detected.'));
    return;
  }

  // Load source map
  const saved: SourceMapOutput = JSON.parse(fs.readFileSync(sourceMapPath, 'utf-8'));
  const savedRoot = saved.root;

  // Reconstruct graph
  const graph = new DepGraph();
  for (const [rel, data] of Object.entries(saved.files)) {
    const abs = path.join(savedRoot, rel);
    graph.addFile(abs);
    for (const imp of data.imports) graph.addEdge(abs, path.join(savedRoot, imp));
  }

  // BFS: find all impacted files from changed files
  const changedSet = new Set(changedFiles);
  const impactedSet = new Set<string>();

  for (const rel of changedFiles) {
    const abs = path.join(root, rel);
    const impacted = graph.getImpacted(abs);
    for (const imp of impacted) {
      const impRel = path.relative(root, imp.file);
      if (!changedSet.has(impRel)) {
        impactedSet.add(impRel);
      }
    }
  }

  // Build review file list
  const reviewFiles: ReviewFile[] = [];

  for (const rel of changedFiles) {
    const data = saved.files[rel];
    if (!data) continue;
    reviewFiles.push({
      path: rel,
      reason: 'changed',
      type: data.type,
      complexity: data.complexity,
      riskScore: data.riskScore,
      importedByCount: data.importedByCount,
    });
  }

  for (const rel of [...impactedSet].sort()) {
    const data = saved.files[rel];
    if (!data) continue;
    reviewFiles.push({
      path: rel,
      reason: 'impacted',
      type: data.type,
      complexity: data.complexity,
      riskScore: data.riskScore,
      importedByCount: data.importedByCount,
    });
  }

  // Sort impacted files by risk score descending
  const changed = reviewFiles.filter(f => f.reason === 'changed');
  const impacted = reviewFiles
    .filter(f => f.reason === 'impacted')
    .sort((a, b) => b.riskScore - a.riskScore || b.importedByCount - a.importedByCount);

  const allFiles = [...changed, ...impacted];

  if (opts.json) {
    const output = JSON.stringify({
      sourceBranch,
      targetBranch,
      diffRef,
      mr: mrUrl ? { title: mrTitle, url: mrUrl } : undefined,
      changed: changed.map(f => f.path),
      impacted: impacted.map(f => f.path),
    }, null, 2);
    if (opts.output) {
      fs.writeFileSync(path.resolve(opts.output), output, 'utf-8');
    } else {
      console.log(output);
    }
    return;
  }

  // Generate markdown review context for Claude
  const lines: string[] = [];
  lines.push(`# Code Review Context`);

  if (mrUrl) {
    lines.push(`> MR: [${mrTitle}](${mrUrl})`);
    lines.push(`> Branches: \`${sourceBranch}\` → \`${targetBranch}\` | Generated by lumina`);
  } else {
    lines.push(`> Diff: \`${diffRef}\` | Generated by lumina`);
  }
  lines.push(`> **Review only the files listed below** — do NOT scan the full source tree.`);
  lines.push(``);

  lines.push(`## Instructions for Claude`);
  lines.push(``);
  lines.push(`### Workflow`);
  lines.push(`1. Read each file in **Changed Files** — these were directly modified.`);
  lines.push(`2. Read each file in **Impacted Files** — these import the changed files and may be affected.`);
  lines.push(`3. Do NOT open files outside this list unless a finding requires it.`);
  lines.push(``);
  lines.push(`### Review Checklist`);
  lines.push(``);
  lines.push(`**Correctness**`);
  lines.push(`- Logic errors, off-by-one, null/undefined dereference`);
  lines.push(`- Async/await misuse, unhandled promise rejections`);
  lines.push(`- Race conditions, stale closures`);
  lines.push(`- Wrong assumptions about data shape from API responses`);
  lines.push(``);
  lines.push(`**Security**`);
  lines.push(`- User input not sanitized before use`);
  lines.push(`- Sensitive data (tokens, keys) logged or exposed`);
  lines.push(`- XSS via dangerouslySetInnerHTML or direct DOM injection`);
  lines.push(`- Auth checks missing or bypassable`);
  lines.push(``);
  lines.push(`**Performance**`);
  lines.push(`- Unnecessary re-renders (missing memo/callback)`);
  lines.push(`- Heavy computation in render path`);
  lines.push(`- N+1 API calls inside loops`);
  lines.push(`- Missing cleanup in useEffect`);
  lines.push(``);
  lines.push(`**Design & Conventions**`);
  lines.push(`- Naming inconsistencies (camelCase vs PascalCase, etc.)`);
  lines.push(`- Duplicate code or abstractions that should be shared`);
  lines.push(`- Anti-patterns (e.g. useTransition for async, any type, hardcoded strings)`);
  lines.push(`- Missing or wrong TypeScript types`);
  lines.push(``);
  lines.push(`**Test Coverage** (if test files are in scope)`);
  lines.push(`- Mock data matches production enums/types`);
  lines.push(`- Edge cases and error paths are tested`);
  lines.push(``);
  lines.push(`### Output Format`);
  lines.push(`Group findings by file. For each issue:`);
  lines.push(`- Severity: 🔴 Bug | 🟡 Design | 🟢 Minor`);
  lines.push(`- Show the problematic code snippet`);
  lines.push(`- Explain why it's an issue`);
  lines.push(`- Suggest a fix`);
  lines.push(``);
  lines.push(`End with a **Summary table**: severity × count, and highlight what must be fixed before merge.`);
  lines.push(``);

  lines.push(`## Changed Files (${changed.length})`);
  lines.push(``);
  lines.push(`| File | Type | Complexity | Risk |`);
  lines.push(`|------|------|-----------|------|`);
  for (const f of changed) {
    const risk = f.riskScore > 20 ? '🔥 High' : f.riskScore > 5 ? '⚠️ Medium' : '✅ Low';
    lines.push(`| \`${f.path}\` | ${f.type} | ${f.complexity} | ${risk} |`);
  }
  lines.push(``);

  lines.push(`## Impacted Files (${impacted.length})`);
  lines.push(`> These files import — directly or transitively — one or more of the changed files.`);
  lines.push(``);

  if (impacted.length === 0) {
    lines.push(`_No downstream files impacted._`);
  } else {
    lines.push(`| File | Type | Imported By | Risk |`);
    lines.push(`|------|------|-------------|------|`);
    for (const f of impacted) {
      const risk = f.riskScore > 20 ? '🔥' : f.riskScore > 5 ? '⚠️' : '✅';
      lines.push(`| \`${f.path}\` | ${f.type} | ${f.importedByCount} | ${risk} |`);
    }
  }
  lines.push(``);

  // Cycles warning for changed files
  const relevantCycles = saved.cycles.filter(cycle =>
    cycle.some(f => changedSet.has(f))
  );
  if (relevantCycles.length > 0) {
    lines.push(`## ⚠️ Circular Dependencies Involving Changed Files`);
    lines.push(``);
    for (const cycle of relevantCycles) {
      lines.push(`- ${cycle.map(f => `\`${f}\``).join(' → ')}`);
    }
    lines.push(``);
    lines.push(`> Changes in circular dep chains can cause unexpected side effects. Review these paths carefully.`);
    lines.push(``);
  }

  // Token estimation
  let reviewBytes = 0;
  for (const f of allFiles) {
    const abs = path.join(root, f.path);
    try { reviewBytes += fs.statSync(abs).size; } catch { /* skip */ }
  }

  let fullRepoBytes = 0;
  for (const rel of Object.keys(saved.files)) {
    const abs = path.join(root, rel);
    try { fullRepoBytes += fs.statSync(abs).size; } catch { /* skip */ }
  }

  const BYTES_PER_TOKEN = 4;
  const OVERHEAD_TOKENS = 3000;
  const reviewTokens = Math.round(reviewBytes / BYTES_PER_TOKEN) + OVERHEAD_TOKENS;
  const fullRepoTokens = Math.round(fullRepoBytes / BYTES_PER_TOKEN) + OVERHEAD_TOKENS;
  const savedTokens = fullRepoTokens - reviewTokens;
  const savingPct = Math.round((1 - reviewTokens / fullRepoTokens) * 100);

  const COST_PER_TOKEN = 3 / 1_000_000;
  const reviewCost = (reviewTokens * COST_PER_TOKEN).toFixed(4);
  const fullCost = (fullRepoTokens * COST_PER_TOKEN).toFixed(4);

  lines.push(`---`);
  lines.push(`**Total files to review: ${allFiles.length}** (${changed.length} changed + ${impacted.length} impacted)`);
  lines.push(`vs full repo: **${saved.totalFiles} files** — saving ${Math.round((1 - allFiles.length / saved.totalFiles) * 100)}% scan effort`);
  lines.push(``);
  lines.push(`## Token Estimate`);
  lines.push(``);
  lines.push(`| | Lumina review | Full repo scan |`);
  lines.push(`|---|---|---|`);
  lines.push(`| Files | ${allFiles.length} | ${saved.totalFiles} |`);
  lines.push(`| Input tokens | ~${reviewTokens.toLocaleString()} | ~${fullRepoTokens.toLocaleString()} |`);
  lines.push(`| Est. cost (Sonnet $3/MTok) | ~$${reviewCost} | ~$${fullCost} |`);
  lines.push(`| Tokens saved | | **~${savedTokens.toLocaleString()} (${savingPct}%)** |`);

  const content = lines.join('\n');

  if (opts.output) {
    const outPath = path.resolve(opts.output);
    fs.writeFileSync(outPath, content, 'utf-8');
    console.log(pc.green('✓') + ` Review context saved: ${outPath}`);
    console.log(pc.dim(`  ${changed.length} changed + ${impacted.length} impacted = ${allFiles.length} files to review (of ${saved.totalFiles} total)`));
    console.log(pc.dim(`  ~${reviewTokens.toLocaleString()} tokens (~$${reviewCost}) vs full scan ~${fullRepoTokens.toLocaleString()} tokens (~$${fullCost})`));
  } else {
    console.log(content);
  }
}
