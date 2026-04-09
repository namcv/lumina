import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: Array<{
      matcher: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
  };
}

function buildLuminaReviewSkill(projectRoot: string): string {
  return `Generate a focused code review using Lumina's impact analysis.

## Project Root
This skill is configured for: \`${projectRoot}\`

## Steps

1. Parse \`\${ARGUMENTS}\` to extract an optional \`--root <path>\` or \`-r <path>\` override.
   If not provided, use the default root: \`${projectRoot}\`

2. Determine the review mode from the remaining args:
   - Empty → default vs main
   - Starts with \`http\` → use \`--mr\` flag
   - Two words (e.g. \`feat/x main\`) → \`<source> <target>\` positional args
   - One word → single ref (e.g. \`develop\`, \`HEAD~3\`)

3. Run the appropriate command (replace \`<root>\` with resolved root):

   **Default (vs main):**
   \`\`\`bash
   npx @namcv/lumina@latest review main HEAD --root <root> -o <root>/.claude/review-context.md
   \`\`\`

   **Single ref:**
   \`\`\`bash
   npx @namcv/lumina@latest review <ref> --root <root> -o <root>/.claude/review-context.md
   \`\`\`

   **Source + Target:**
   \`\`\`bash
   npx @namcv/lumina@latest review <source> <target> --root <root> -o <root>/.claude/review-context.md
   \`\`\`

   **MR/PR URL:**
   \`\`\`bash
   npx @namcv/lumina@latest review --mr <url> --root <root> -o <root>/.claude/review-context.md
   \`\`\`

4. Read the generated file: \`<root>/.claude/review-context.md\`

5. Read each **Changed Files** and **Impacted Files** listed — paths are relative to \`<root>\`.

6. Provide a thorough code review:
   - **Overview** — what the MR does
   - **Issues** — bugs, incorrect logic, unsafe code (grouped by file)
   - **Design concerns** — architecture, naming, anti-patterns
   - **Minor** — style, consistency, cleanup
   - **Summary table** — severity × count

Focus on: correctness, edge cases, regressions in the impact chain, security, performance.
Do NOT read files outside the review-context.md list unless a finding requires it.

## Usage

\`\`\`
/lumina-review                                          # review vs main (default root: ${projectRoot})
/lumina-review develop                                  # diff develop...HEAD
/lumina-review feat/my-feature main                     # source vs target branch
/lumina-review HEAD~3                                   # last 3 commits
/lumina-review https://github.com/owner/repo/pull/123  # from GitHub PR URL
/lumina-review https://gitlab.com/.../merge_requests/1 # from GitLab MR URL

# Override root for a different repo
/lumina-review --root ./other-repo feat/x main
\`\`\`

Set \`GITHUB_TOKEN\` or \`GITLAB_TOKEN\` env vars for private repositories when using a URL.
`;
}

/**
 * Setup Claude Code hooks and slash commands for Lumina.
 */
export async function initCommand(opts: { root?: string }): Promise<void> {
  const root = path.resolve(opts.root ?? process.cwd());
  const claudeDir = path.join(root, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const commandsDir = path.join(claudeDir, 'commands');
  const skillPath = path.join(commandsDir, 'lumina-review.md');

  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(commandsDir, { recursive: true });

  // 1. Write /lumina-review skill (with project root baked in)
  fs.writeFileSync(skillPath, buildLuminaReviewSkill(root), 'utf-8');
  console.log(pc.green('✓') + ' Slash command created: ' + pc.cyan('/lumina-review'));
  console.log(pc.dim(`  File: ${skillPath}`));
  console.log('');

  // 2. Configure PostToolUse hook
  let settings: ClaudeSettings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      settings = {};
    }
  }

  settings.hooks ??= {};
  settings.hooks.PostToolUse ??= [];

  const HOOK_MATCHER = 'Edit|Write|MultiEdit';
  const HOOK_COMMAND = 'npx lumina analyze --output .claude';

  const existing = settings.hooks.PostToolUse.find((h) => h.matcher === HOOK_MATCHER);
  if (existing) {
    const alreadyExists = existing.hooks.some((h) => h.command === HOOK_COMMAND);
    if (!alreadyExists) {
      existing.hooks.push({ type: 'command', command: HOOK_COMMAND });
    }
  } else {
    settings.hooks.PostToolUse.push({
      matcher: HOOK_MATCHER,
      hooks: [{ type: 'command', command: HOOK_COMMAND }],
    });
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  console.log(pc.green('✓') + ' Claude Code hook configured');
  console.log(pc.dim(`  Trigger: PostToolUse (Edit, Write, MultiEdit)`));
  console.log(pc.dim(`  Command: ${HOOK_COMMAND}`));
  console.log('');

  // 3. Run initial analyze
  console.log(pc.cyan('Running initial analysis...'));
  const { analyze } = await import('../../analyze.js');
  const result = await analyze({ root, outputDir: claudeDir });
  console.log(pc.green('✓') + ` Done — ${result.sourceMap.totalFiles} files analyzed`);
  console.log(pc.dim(`  CLAUDE.md  → ${path.join(root, 'CLAUDE.md')}`));
  console.log(pc.dim(`  source-map → ${path.join(claudeDir, 'source-map.json')}`));
  console.log('');
  console.log(pc.bold('Lumina is ready! Try:'));
  console.log(`  ${pc.cyan('npx lumina graph --open')}         view dependency graph`);
  console.log(`  ${pc.cyan('/lumina-review')}                  review current MR in Claude Code`);
}
