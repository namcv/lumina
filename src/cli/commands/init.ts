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

const LUMINA_REVIEW_SKILL = `Generate a focused code review using Lumina's impact analysis.

## Steps

1. Run the following command to generate review context:
\`\`\`bash
npx @namcv/lumina review --base \${ARGUMENTS:-main} --root $(pwd) -o .claude/review-context.md
\`\`\`

2. Read the generated file: \`.claude/review-context.md\`

3. Read each file listed in the **Changed Files** section — these were directly modified.

4. Read each file listed in the **Impacted Files** section — these import the changed files and may be affected.

5. Provide a thorough code review:
   - **Overview** — what the MR does
   - **Issues** — bugs, incorrect logic, unsafe code (grouped by file)
   - **Design concerns** — architecture, naming, anti-patterns
   - **Minor** — style, consistency, cleanup
   - **Summary table** — severity × count

Focus on: correctness, edge cases, regressions in the impact chain, security, performance.
Do NOT read files outside the review-context.md list unless a finding requires it.

Usage:
- \`/lumina-review\` — review against main branch
- \`/lumina-review develop\` — review against develop branch
- \`/lumina-review HEAD~3\` — review last 3 commits
`;

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

  // 1. Write /lumina-review skill
  fs.writeFileSync(skillPath, LUMINA_REVIEW_SKILL, 'utf-8');
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
