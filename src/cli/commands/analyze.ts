import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { analyze } from '../../analyze.js';
import { generateHealthReport } from '../../generators/health-report.js';

export async function analyzeCommand(
  targetPath: string | undefined,
  opts: { output?: string; health?: boolean; skipGit?: boolean; skipUnused?: boolean },
): Promise<void> {
  const root = path.resolve(targetPath ?? process.cwd());
  const outputDir = opts.output ? path.resolve(opts.output) : undefined;

  console.log(pc.cyan(`Analyzing: ${root}`));
  console.log('');

  const start = Date.now();
  const result = await analyze({
    root, outputDir,
    skipGit: opts.skipGit,
    skipUnusedExports: opts.skipUnused,
  });
  const elapsed = Date.now() - start;

  console.log(pc.green('✓') + ` Detected frameworks: ${result.frameworks.join(', ') || 'none'}`);
  console.log(pc.green('✓') + ` Files analyzed: ${result.sourceMap.totalFiles}`);
  console.log(pc.green('✓') + ` Circular deps: ${result.sourceMap.cycles.length === 0 ? 'none' : pc.red(String(result.sourceMap.cycles.length))}`);
  console.log(pc.green('✓') + ` Duplicates: ${result.sourceMap.duplicates.length} groups`);

  if (result.reactInfo) {
    const { components, hooks, contexts } = result.reactInfo;
    console.log(pc.green('✓') + ` React — components: ${components.length}, hooks: ${hooks.length}, contexts: ${contexts.length}`);
  }
  if (result.nestjsInfo) {
    const { modules, controllers, services } = result.nestjsInfo;
    console.log(pc.green('✓') + ` NestJS — modules: ${modules.length}, controllers: ${controllers.length}, services: ${services.length}`);
  }

  console.log('');
  console.log(pc.dim('Output files:'));
  console.log(`  ${pc.bold('CLAUDE.md')}          → ${path.join(result.root, 'CLAUDE.md')}`);
  console.log(`  ${pc.bold('source-map.json')}    → ${path.join(result.outputDir, 'source-map.json')}`);

  if (opts.health) {
    const healthMd = generateHealthReport(result.sourceMap);
    const healthPath = path.join(result.root, 'HEALTH.md');
    fs.writeFileSync(healthPath, healthMd, 'utf-8');
    console.log(`  ${pc.bold('HEALTH.md')}          → ${healthPath}`);
  }

  console.log('');
  console.log(pc.dim(`Done in ${elapsed}ms`));
}
