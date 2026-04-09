import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { generateHtmlGraph } from '../../generators/html-graph.js';
import type { SourceMapOutput } from '../../generators/graph.js';

export async function graphCommand(opts: {
  root?: string;
  output?: string;
  min?: string;
  open?: boolean;
}): Promise<void> {
  const root = path.resolve(opts.root ?? process.cwd());
  const sourceMapPath = path.join(root, '.claude', 'source-map.json');

  if (!fs.existsSync(sourceMapPath)) {
    console.error(pc.red('✗') + ' source-map.json not found. Run `repo-mapper analyze` first.');
    process.exit(1);
  }

  const sourceMap: SourceMapOutput = JSON.parse(fs.readFileSync(sourceMapPath, 'utf-8'));
  const minImporters = parseInt(opts.min ?? '0') || 0;
  const outPath = path.resolve(opts.output ?? path.join(root, '.claude', 'graph.html'));
  const title = path.basename(root) + ' — Dependency Graph';

  const html = generateHtmlGraph(sourceMap, { minImporters, title });
  fs.writeFileSync(outPath, html, 'utf-8');

  console.log(pc.green('✓') + ` Graph generated: ${outPath}`);
  console.log(pc.dim(`  Files: ${sourceMap.totalFiles} total`));
  console.log(pc.dim(`  Filter: importedBy >= ${minImporters}`));

  if (opts.open) {
    const { execSync } = await import('node:child_process');
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    execSync(`${cmd} "${outPath}"`);
  } else {
    console.log('');
    console.log(`Open in browser: ${pc.cyan(outPath)}`);
  }
}
