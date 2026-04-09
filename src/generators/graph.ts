import path from 'node:path';
import type { DepGraph } from '../utils/dep-graph.js';
import type { FileInfo } from '../analyzers/base.js';
import type { HttpInfo } from '../analyzers/http.js';
import type { GitRiskEntry } from '../analyzers/git.js';

export interface FileEntry {
  type: FileInfo['type'];
  imports: string[];
  importedBy: string[];
  importedByCount: number;
  linesOfCode: number;
  complexity: number;
  httpCalls: Array<{ method: string; url: string; pattern: string }>;
  nestjsRoutes: Array<{ method: string; url: string }>;
  hasQueryHook: boolean;
  unusedExports: string[];
  gitChurn: number;
  riskScore: number;
  package?: string;          // monorepo: which sub-package this belongs to
}

export interface SourceMapOutput {
  generated: string;
  root: string;
  framework: string[];
  totalFiles: number;
  packages?: string[];       // monorepo sub-package names
  cycles: string[][];        // each cycle = list of relative file paths
  duplicates: Array<{ name: string; files: string[] }>;
  files: Record<string, FileEntry>;
}

export interface GenerateGraphOptions {
  root: string;
  graph: DepGraph;
  files: FileInfo[];
  frameworks: string[];
  httpMap?: Map<string, HttpInfo>;
  unusedExportsMap?: Record<string, string[]>;
  gitRiskMap?: Map<string, GitRiskEntry>;
  duplicates?: Array<{ name: string; files: string[] }>;
  packageMap?: Map<string, string>;   // filePath → packageName
}

/**
 * Generate the source-map.json output.
 */
export function generateGraph(opts: GenerateGraphOptions): SourceMapOutput {
  const { root, graph, files, frameworks, httpMap, unusedExportsMap, gitRiskMap, duplicates, packageMap } = opts;

  const fileMap = new Map(files.map((f) => [f.path, f]));
  const filesOutput: SourceMapOutput['files'] = {};

  for (const filePath of graph.getAllFiles()) {
    const rel = path.relative(root, filePath);
    const fileInfo = fileMap.get(filePath);
    const imports = graph.getImports(filePath).map((f) => path.relative(root, f));
    const importedBy = graph.getImportedBy(filePath).map((f) => path.relative(root, f));
    const http = httpMap?.get(filePath);
    const git = gitRiskMap?.get(filePath);
    const loc = fileInfo?.linesOfCode ?? 0;
    const httpCallCount = http?.calls.length ?? 0;

    const complexity = Math.round(
      (imports.length * 0.3 + importedBy.length * 0.5 + httpCallCount * 0.8 + loc / 100) * 10,
    ) / 10;

    filesOutput[rel] = {
      type: fileInfo?.type ?? 'unknown',
      imports,
      importedBy,
      importedByCount: importedBy.length,
      linesOfCode: loc,
      complexity,
      httpCalls: http?.calls ?? [],
      nestjsRoutes: http?.nestjsRoutes ?? [],
      hasQueryHook: http?.hasQueryHook ?? false,
      unusedExports: unusedExportsMap?.[rel] ?? [],
      gitChurn: git?.churn ?? 0,
      riskScore: git?.riskScore ?? 0,
      package: packageMap?.get(filePath),
    };
  }

  // Cycles — convert abs paths to relative
  const cycles = graph.detectCycles().map((cycle) =>
    cycle.map((f) => path.relative(root, f)),
  );

  return {
    generated: new Date().toISOString(),
    root,
    framework: frameworks,
    totalFiles: files.length,
    cycles,
    duplicates: duplicates ?? [],
    files: filesOutput,
  };
}
