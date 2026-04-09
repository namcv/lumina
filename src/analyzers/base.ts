import fs from 'node:fs';
import path from 'node:path';
import { DepGraph } from '../utils/dep-graph.js';
import { walkFiles, resolveImport } from '../utils/file-walker.js';

// Matches: import ... from '...' or import('...')  or require('...')  or export ... from '...'
const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)|import\(['"]([^'"]+)['"]\)/g;

/**
 * Extract all import/require paths from file content.
 */
export function extractImports(content: string): string[] {
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;

  while ((match = IMPORT_RE.exec(content)) !== null) {
    const importPath = match[1] ?? match[2] ?? match[3];
    if (importPath) imports.push(importPath);
  }

  return imports;
}

export interface FileInfo {
  path: string;
  relativePath: string;
  imports: string[];
  linesOfCode: number;
  type: 'unknown' | 'react-component' | 'react-hook' | 'react-context' | 'nestjs-module' | 'nestjs-controller' | 'nestjs-service' | 'nestjs-guard' | 'nestjs-interceptor' | 'nestjs-pipe';
}

/**
 * Analyze all files in a directory and build a dependency graph.
 */
export function analyzeFiles(root: string): { graph: DepGraph; files: FileInfo[] } {
  const allFiles = walkFiles(root);
  const graph = new DepGraph();
  const files: FileInfo[] = [];

  // First pass: register all files
  for (const file of allFiles) {
    graph.addFile(file);
  }

  // Second pass: parse imports and build edges
  for (const file of allFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const importPaths = extractImports(content);
    const resolvedImports: string[] = [];

    for (const importPath of importPaths) {
      const resolved = resolveImport(file, importPath, root);
      if (resolved) {
        graph.addEdge(file, resolved);
        resolvedImports.push(resolved);
      }
    }

    files.push({
      path: file,
      relativePath: path.relative(root, file),
      imports: resolvedImports,
      linesOfCode: content.split('\n').length,
      type: 'unknown',
    });
  }

  return { graph, files };
}
