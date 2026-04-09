import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import type { SourceMapOutput } from '../../generators/graph.js';

export async function contextCommand(opts: {
  file: string;
  root?: string;
  output?: string;
}): Promise<void> {
  const root = path.resolve(opts.root ?? process.cwd());
  const sourceMapPath = path.join(root, '.claude', 'source-map.json');

  if (!fs.existsSync(sourceMapPath)) {
    console.error(pc.red('✗') + ' source-map.json not found. Run `repo-mapper analyze` first.');
    process.exit(1);
  }

  const sourceMap: SourceMapOutput = JSON.parse(fs.readFileSync(sourceMapPath, 'utf-8'));

  const targetAbs = path.isAbsolute(opts.file) ? opts.file : path.resolve(root, opts.file);
  const rel = path.relative(root, targetAbs);
  const fileData = sourceMap.files[rel];

  if (!fileData) {
    console.error(pc.red('✗') + ` File not found in source map: ${rel}`);
    console.error(pc.dim('Run `repo-mapper analyze` to refresh.'));
    process.exit(1);
  }

  // Check if file is in any cycle
  const inCycles = sourceMap.cycles.filter(c => c.includes(rel));

  const lines: string[] = [];
  lines.push(`## Context: \`${rel}\``);
  lines.push(``);
  lines.push(`### Classification`);
  lines.push(`- **Type**: ${fileData.type}${fileData.hasQueryHook || fileData.httpCalls.length > 0 ? ' (HTTP Caller)' : ''}`);
  lines.push(`- **Lines of code**: ${fileData.linesOfCode}`);
  lines.push(`- **Complexity score**: ${fileData.complexity}`);
  lines.push(`- **Git churn**: ${fileData.gitChurn > 0 ? `${fileData.gitChurn} commits` : 'N/A'}`);
  lines.push(`- **Risk score**: ${fileData.riskScore > 0 ? fileData.riskScore : 'N/A'}`);
  lines.push(`- **Cycles**: ${inCycles.length > 0 ? `⚠️ Part of ${inCycles.length} cycle(s)` : 'None'}`);
  lines.push(``);

  lines.push(`### Dependencies`);
  lines.push(`- **Imported by**: ${fileData.importedByCount} file(s)`);
  if (fileData.importedBy.length > 0) {
    fileData.importedBy.slice(0, 10).forEach(f => lines.push(`  - \`${f}\``));
    if (fileData.importedBy.length > 10) lines.push(`  - _...and ${fileData.importedBy.length - 10} more_`);
  }
  lines.push(`- **Imports**: ${fileData.imports.length} file(s)`);
  if (fileData.imports.length > 0) {
    fileData.imports.slice(0, 10).forEach(f => lines.push(`  - \`${f}\``));
    if (fileData.imports.length > 10) lines.push(`  - _...and ${fileData.imports.length - 10} more_`);
  }
  lines.push(``);

  if (fileData.httpCalls.length > 0 || fileData.hasQueryHook) {
    lines.push(`### HTTP Calls`);
    if (fileData.hasQueryHook) lines.push(`- Uses \`useQuery\`/\`useMutation\``);
    fileData.httpCalls.forEach(c => lines.push(`- \`${c.method}\` ${c.url} _(${c.pattern})_`));
    lines.push(``);
  }

  if (fileData.nestjsRoutes.length > 0) {
    lines.push(`### NestJS Routes`);
    fileData.nestjsRoutes.forEach(r => lines.push(`- \`${r.method}\` ${r.url}`));
    lines.push(``);
  }

  if (fileData.unusedExports.length > 0) {
    lines.push(`### Unused Exports`);
    lines.push(`The following exports appear unused: ${fileData.unusedExports.map(e => `\`${e}\``).join(', ')}`);
    lines.push(``);
  }

  if (inCycles.length > 0) {
    lines.push(`### ⚠️ Circular Dependencies`);
    inCycles.forEach((cycle, i) => lines.push(`**Cycle ${i + 1}:** ${cycle.map(f => `\`${f}\``).join(' → ')}`));
    lines.push(``);
  }

  const output = lines.join('\n');

  if (opts.output) {
    fs.writeFileSync(path.resolve(opts.output), output, 'utf-8');
    console.error(pc.green('✓') + ` Context saved to: ${opts.output}`);
  } else {
    console.log(output);
  }
}
