import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { analyzeFiles } from '../../analyzers/base.js';
import { calculateImpact, renderImpactMarkdown } from '../../generators/impact-report.js';

export async function impactCommand(
  file: string,
  opts: { root?: string; output?: string },
): Promise<void> {
  const root = path.resolve(opts.root ?? process.cwd());
  // Resolve --file relative to --root (or cwd if no --root)
  const targetFile = path.isAbsolute(file) ? file : path.resolve(root, file);

  // Try to load existing source-map.json for speed, fall back to re-analysis
  const sourceMapPath = path.join(root, '.claude', 'source-map.json');
  let graph: import('../../utils/dep-graph.js').DepGraph;

  const { analyzeFiles: _analyzeFiles } = await import('../../analyzers/base.js');
  const { DepGraph } = await import('../../utils/dep-graph.js');

  if (fs.existsSync(sourceMapPath)) {
    // Reconstruct graph from saved JSON
    const saved = JSON.parse(fs.readFileSync(sourceMapPath, 'utf-8'));
    graph = new DepGraph();
    const savedRoot: string = saved.root;

    for (const [rel, data] of Object.entries(saved.files as Record<string, { imports: string[] }>)) {
      const abs = path.join(savedRoot, rel);
      graph.addFile(abs);
      for (const imp of data.imports) {
        graph.addEdge(abs, path.join(savedRoot, imp));
      }
    }
  } else {
    console.log(pc.dim('No source-map.json found, analyzing now...'));
    const result = _analyzeFiles(root);
    graph = result.graph;
  }

  const result = calculateImpact(targetFile, root, graph);

  // Console output
  console.log('');
  console.log(pc.cyan(`Impact analysis for: ${pc.bold(result.changedFile)}`));
  console.log('');

  if (result.totalImpacted === 0) {
    console.log(pc.green('No other files are impacted.'));
  } else {
    console.log(`Total impacted files: ${pc.bold(String(result.totalImpacted))}`);

    if (result.criticalFiles.length > 0) {
      console.log('');
      console.log(pc.red('Critical (high fan-out):'));
      for (const f of result.criticalFiles) {
        console.log(`  ${pc.red('●')} ${f}`);
      }
    }

    console.log('');
    // Group by depth
    const byDepth = new Map<number, string[]>();
    for (const { file, depth } of result.impacted) {
      if (!byDepth.has(depth)) byDepth.set(depth, []);
      byDepth.get(depth)!.push(file);
    }

    for (const [depth, files] of [...byDepth.entries()].sort(([a], [b]) => a - b)) {
      console.log(pc.yellow(`Depth ${depth}:`));
      for (const f of files) {
        console.log(`  ${pc.dim('─')} ${f}`);
      }
    }
  }

  // Optional: write markdown output
  if (opts.output) {
    const md = renderImpactMarkdown(result);
    const outPath = path.resolve(opts.output);
    fs.writeFileSync(outPath, md, 'utf-8');
    console.log('');
    console.log(pc.dim(`Report saved to: ${outPath}`));
  }
}
