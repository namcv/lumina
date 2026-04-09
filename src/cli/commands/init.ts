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

/**
 * Setup Claude Code hooks to auto-run repo-mapper analyze after file edits.
 */
export async function initCommand(opts: { root?: string }): Promise<void> {
  const root = path.resolve(opts.root ?? process.cwd());
  const claudeDir = path.join(root, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  fs.mkdirSync(claudeDir, { recursive: true });

  let settings: ClaudeSettings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      settings = {};
    }
  }

  // Add hook: after Write/Edit tools, re-run analyze
  settings.hooks ??= {};
  settings.hooks.PostToolUse ??= [];

  const HOOK_MATCHER = 'Edit|Write|MultiEdit';
  const HOOK_COMMAND = 'npx repo-mapper analyze --output .claude';

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

  console.log('');
  console.log(pc.green('✓') + ' Claude Code hooks configured!');
  console.log('');
  console.log(pc.dim('File: ') + settingsPath);
  console.log('');
  console.log('Hook added:');
  console.log(`  ${pc.dim('Trigger:')} PostToolUse (Edit, Write, MultiEdit)`);
  console.log(`  ${pc.dim('Command:')} ${HOOK_COMMAND}`);
  console.log('');
  console.log(pc.dim('Claude Code will now auto-regenerate source maps after each file change.'));

  // Also run initial analyze
  console.log('');
  console.log(pc.cyan('Running initial analysis...'));
  const { analyze } = await import('../../analyze.js');
  const result = await analyze({ root, outputDir: claudeDir });
  console.log(pc.green('✓') + ` Done — ${result.sourceMap.totalFiles} files analyzed.`);
  console.log(`  CLAUDE.md → ${path.join(root, 'CLAUDE.md')}`);
}
