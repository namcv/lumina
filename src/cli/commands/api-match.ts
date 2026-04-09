import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { analyze } from '../../analyze.js';
import type { SourceMapOutput } from '../../generators/graph.js';
import type { ApiMatchSummary } from '../../generators/health-report.js';

interface RouteEntry {
  method: string;
  url: string;
  file: string;
  normalized: string;
}

/** Normalize URL for matching: strip dynamic segments, trailing slashes */
function normalizeUrl(url: string): string {
  return url
    .replace(/:[\w]+/g, '*')       // :id → *
    .replace(/\{[\w]+\}/g, '*')    // {id} → *
    .replace(/\/+$/, '')            // trailing slash
    .replace(/\/+/g, '/')           // double slashes
    .toLowerCase() || '/';
}

function loadOrAnalyze(repoPath: string): Promise<SourceMapOutput> {
  const sourceMapPath = path.join(repoPath, '.claude', 'source-map.json');
  if (fs.existsSync(sourceMapPath)) {
    return Promise.resolve(JSON.parse(fs.readFileSync(sourceMapPath, 'utf-8')));
  }
  return analyze({ root: repoPath, writeClaudeMd: false, skipGit: true, skipUnusedExports: true })
    .then(r => r.sourceMap);
}

export async function apiMatchCommand(opts: {
  frontend: string;
  backend: string;
  output?: string;
}): Promise<void> {
  const frontendRoot = path.resolve(opts.frontend);
  const backendRoot  = path.resolve(opts.backend);

  console.log(pc.cyan('Loading frontend source map...'));
  const frontendMap = await loadOrAnalyze(frontendRoot);

  console.log(pc.cyan('Loading backend source map...'));
  const backendMap  = await loadOrAnalyze(backendRoot);

  // Collect all frontend HTTP calls
  const frontendCalls: RouteEntry[] = [];
  for (const [file, data] of Object.entries(frontendMap.files)) {
    for (const call of data.httpCalls) {
      frontendCalls.push({
        method: call.method,
        url: call.url,
        file,
        normalized: `${call.method}:${normalizeUrl(call.url)}`,
      });
    }
  }

  // Collect all backend NestJS routes
  const backendRoutes: RouteEntry[] = [];
  for (const [file, data] of Object.entries(backendMap.files)) {
    for (const route of data.nestjsRoutes) {
      backendRoutes.push({
        method: route.method,
        url: route.url,
        file,
        normalized: `${route.method}:${normalizeUrl(route.url)}`,
      });
    }
  }

  if (frontendCalls.length === 0 && backendRoutes.length === 0) {
    console.log(pc.yellow('No HTTP calls or NestJS routes found in either repo.'));
    return;
  }

  const backendSet  = new Map(backendRoutes.map(r => [r.normalized, r]));
  const frontendSet = new Map(frontendCalls.map(c => [c.normalized, c]));

  const matched: RouteEntry[]          = [];
  const unmatchedFrontend: RouteEntry[] = [];
  const unmatchedBackend: RouteEntry[]  = [];

  for (const call of frontendCalls) {
    if (backendSet.has(call.normalized)) matched.push(call);
    else unmatchedFrontend.push(call);
  }
  for (const route of backendRoutes) {
    if (!frontendSet.has(route.normalized)) unmatchedBackend.push(route);
  }

  // Console output
  console.log('');
  console.log(`Frontend calls : ${pc.bold(String(frontendCalls.length))}`);
  console.log(`Backend routes : ${pc.bold(String(backendRoutes.length))}`);
  console.log(`✅ Matched     : ${pc.green(String(matched.length))}`);
  console.log(`❌ Unmatched FE: ${pc.red(String(unmatchedFrontend.length))}`);
  console.log(`🔇 Dead routes : ${pc.yellow(String(unmatchedBackend.length))}`);

  if (unmatchedFrontend.length > 0) {
    console.log('');
    console.log(pc.red('Frontend calls with no backend route:'));
    unmatchedFrontend.slice(0, 10).forEach(c =>
      console.log(`  ${pc.dim('●')} ${c.method} ${c.url}  ${pc.dim(c.file)}`),
    );
    if (unmatchedFrontend.length > 10) console.log(pc.dim(`  ...and ${unmatchedFrontend.length - 10} more`));
  }

  if (unmatchedBackend.length > 0) {
    console.log('');
    console.log(pc.yellow('Backend routes with no frontend caller:'));
    unmatchedBackend.slice(0, 10).forEach(r =>
      console.log(`  ${pc.dim('●')} ${r.method} ${r.url}  ${pc.dim(r.file)}`),
    );
    if (unmatchedBackend.length > 10) console.log(pc.dim(`  ...and ${unmatchedBackend.length - 10} more`));
  }

  // Markdown output
  if (opts.output) {
    const summary: ApiMatchSummary = {
      matched: matched.length,
      unmatchedFrontend: unmatchedFrontend.map(c => ({ method: c.method, url: c.url, file: c.file })),
      unmatchedBackend:  unmatchedBackend.map(r => ({ method: r.method, url: r.url, file: r.file })),
    };

    const { generateHealthReport } = await import('../../generators/health-report.js');
    // Build minimal source map for context
    const md = [
      `# API Contract Report`,
      ``,
      `- **Frontend**: \`${frontendRoot}\``,
      `- **Backend**: \`${backendRoot}\``,
      ``,
      `## Summary`,
      `| | Count |`,
      `|--|--|`,
      `| ✅ Matched | ${matched.length} |`,
      `| ❌ Frontend unmatched | ${unmatchedFrontend.length} |`,
      `| 🔇 Dead backend routes | ${unmatchedBackend.length} |`,
      ``,
    ];

    if (unmatchedFrontend.length > 0) {
      md.push(`## ❌ Frontend Calls with No Backend Route`);
      unmatchedFrontend.forEach(c => md.push(`- \`${c.method} ${c.url}\` — \`${c.file}\``));
      md.push('');
    }
    if (unmatchedBackend.length > 0) {
      md.push(`## 🔇 Dead Backend Routes`);
      unmatchedBackend.forEach(r => md.push(`- \`${r.method} ${r.url}\` — \`${r.file}\``));
      md.push('');
    }
    if (matched.length > 0) {
      md.push(`## ✅ Matched Routes`);
      matched.forEach(c => md.push(`- \`${c.method} ${c.url}\``));
    }

    const outPath = path.resolve(opts.output);
    fs.writeFileSync(outPath, md.join('\n'), 'utf-8');
    console.log('');
    console.log(pc.dim(`Report saved to: ${outPath}`));
  }
}
