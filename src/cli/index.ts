import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import { impactCommand } from './commands/impact.js';
import { initCommand } from './commands/init.js';
import { graphCommand } from './commands/graph.js';
import { prCommentCommand } from './commands/pr-comment.js';
import { contextCommand } from './commands/context.js';
import { apiMatchCommand } from './commands/api-match.js';
import { reviewCommand } from './commands/review.js';

const program = new Command();

program
  .name('lumina')
  .description('Illuminate your codebase — generate source maps and architecture context for Claude Code')
  .version('0.2.0');

program
  .command('analyze [path]')
  .description('Analyze a repo and generate CLAUDE.md + source-map.json')
  .option('-o, --output <dir>', 'Output directory for .claude/ files')
  .option('--health', 'Also generate HEALTH.md architecture health report')
  .option('--skip-git', 'Skip git churn analysis (faster)')
  .option('--skip-unused', 'Skip unused export analysis (faster)')
  .action(analyzeCommand);

program
  .command('impact')
  .description('Show which files are impacted when a given file changes')
  .requiredOption('-f, --file <path>', 'Path to the changed file')
  .option('-r, --root <path>', 'Repo root (default: cwd)')
  .option('-o, --output <path>', 'Save impact report as markdown')
  .action((opts: { file: string; root?: string; output?: string }) =>
    impactCommand(opts.file, { root: opts.root, output: opts.output }),
  );

program
  .command('graph')
  .description('Generate interactive D3.js HTML dependency graph')
  .option('-r, --root <path>', 'Repo root (default: cwd)')
  .option('-o, --output <path>', 'Output HTML file (default: .claude/graph.html)')
  .option('-m, --min <n>', 'Only show files imported by at least N others', '0')
  .option('--open', 'Open in browser after generating')
  .action(graphCommand);

program
  .command('pr-comment')
  .description('Generate PR impact comment from git diff')
  .option('-r, --root <path>', 'Repo root (default: cwd)')
  .option('-b, --base <branch>', 'Base branch to diff against (default: main)', 'main')
  .option('-o, --output <path>', 'Save comment as markdown file')
  .action(prCommentCommand);

program
  .command('context')
  .description('Show full context for a specific file (for Claude Code prompts)')
  .requiredOption('-f, --file <path>', 'Target file path')
  .option('-r, --root <path>', 'Repo root (default: cwd)')
  .option('-o, --output <path>', 'Save context to file instead of stdout')
  .action((opts: { file: string; root?: string; output?: string }) =>
    contextCommand({ file: opts.file, root: opts.root, output: opts.output }),
  );

program
  .command('api-match')
  .description('Match frontend HTTP calls against backend NestJS routes')
  .requiredOption('--frontend <path>', 'Frontend repo path')
  .requiredOption('--backend <path>', 'Backend repo path')
  .option('-o, --output <path>', 'Save match report as markdown')
  .action(apiMatchCommand);

program
  .command('review')
  .description('Generate a focused review context for Claude from git diff + source-map impact')
  .option('-r, --root <path>', 'Repo root (default: cwd)')
  .option('-b, --base <branch>', 'Base branch to diff against (default: main)', 'main')
  .option('-o, --output <path>', 'Save review context as markdown file')
  .option('--json', 'Output as JSON instead of markdown')
  .action((opts: { root?: string; base?: string; output?: string; json?: boolean }) => reviewCommand(opts));

program
  .command('init')
  .description('Setup Claude Code hooks to auto-regenerate source maps on file changes')
  .option('-r, --root <path>', 'Repo root (default: cwd)')
  .action((opts: { root?: string }) => initCommand(opts));

program.parse();
