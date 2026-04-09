import path from 'node:path';
import type { DepGraph } from '../utils/dep-graph.js';

export interface ImpactResult {
  changedFile: string;
  impacted: { file: string; depth: number }[];
  totalImpacted: number;
  criticalFiles: string[]; // files with many importers that are now affected
}

/**
 * Calculate the blast radius when a file changes.
 */
export function calculateImpact(changedFile: string, root: string, graph: DepGraph): ImpactResult {
  const abs = path.isAbsolute(changedFile) ? changedFile : path.resolve(root, changedFile);
  const impacted = graph.getImpacted(abs);

  // Critical = impacted files that themselves have many importers
  const criticalFiles = impacted
    .filter(({ file }) => graph.getImportedBy(file).length >= 3)
    .map(({ file }) => path.relative(root, file));

  return {
    changedFile: path.relative(root, abs),
    impacted: impacted.map(({ file, depth }) => ({
      file: path.relative(root, file),
      depth,
    })),
    totalImpacted: impacted.length,
    criticalFiles,
  };
}

/**
 * Render impact result as a markdown report string.
 */
export function renderImpactMarkdown(result: ImpactResult): string {
  const lines: string[] = [
    `# Impact Report: \`${result.changedFile}\``,
    ``,
    `**Total files impacted:** ${result.totalImpacted}`,
    ``,
  ];

  if (result.totalImpacted === 0) {
    lines.push(`No other files import this file directly or transitively.`);
    return lines.join('\n');
  }

  if (result.criticalFiles.length > 0) {
    lines.push(`## Critical (high fan-out files affected)`);
    for (const f of result.criticalFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  // Group by depth
  const byDepth = new Map<number, string[]>();
  for (const { file, depth } of result.impacted) {
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth)!.push(file);
  }

  lines.push(`## Impacted Files by Depth`);
  for (const [depth, files] of [...byDepth.entries()].sort(([a], [b]) => a - b)) {
    lines.push(`### Depth ${depth} (${files.length} files)`);
    for (const f of files) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}
