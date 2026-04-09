import fs from 'node:fs';
import path from 'node:path';
import type { FileInfo } from './base.js';

// Detect named exports
const EXPORT_RE = /export\s+(?:async\s+)?(?:function|class|const|let|var|enum|type|interface)\s+(\w+)/g;
// export default function/class (anonymous ok but named is trackable)
const EXPORT_DEFAULT_RE = /export\s+default\s+(?:function|class)\s+(\w+)/g;
// export { A, B, C }
const EXPORT_BRACE_RE = /export\s+\{([^}]+)\}/g;

/**
 * Extract all exported symbol names from file content.
 */
function extractExports(content: string): string[] {
  const symbols = new Set<string>();
  let m: RegExpExecArray | null;

  EXPORT_RE.lastIndex = 0;
  while ((m = EXPORT_RE.exec(content)) !== null) symbols.add(m[1]);

  EXPORT_DEFAULT_RE.lastIndex = 0;
  while ((m = EXPORT_DEFAULT_RE.exec(content)) !== null) symbols.add(m[1]);

  EXPORT_BRACE_RE.lastIndex = 0;
  while ((m = EXPORT_BRACE_RE.exec(content)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/\s+as\s+\w+/, '').trim();
      if (name && !name.includes(' ')) symbols.add(name);
    }
  }

  return Array.from(symbols);
}

/**
 * Analyze unused exports across all files.
 * Returns map of filePath → list of exported symbols not used anywhere else.
 */
export function analyzeUnusedExports(files: FileInfo[]): Map<string, string[]> {
  // Step 1: read all file contents
  const contents = new Map<string, string>();
  for (const file of files) {
    try {
      contents.set(file.path, fs.readFileSync(file.path, 'utf-8'));
    } catch { /* skip */ }
  }

  // Step 2: build a single "all other content" string per file for lookup
  // For performance: concatenate all content once, then check per symbol
  const allContent = Array.from(contents.values()).join('\n');

  const result = new Map<string, string[]>();

  for (const file of files) {
    const content = contents.get(file.path);
    if (!content) continue;

    const exports = extractExports(content);
    if (exports.length === 0) continue;

    // Check each exported symbol against ALL other files
    const unused: string[] = [];
    const otherContent = allContent.replace(content, ''); // rough exclusion of self

    for (const sym of exports) {
      // Symbol is "used" if it appears as an identifier (word boundary) in other files
      const usageRe = new RegExp(`\\b${sym}\\b`);
      if (!usageRe.test(otherContent)) {
        unused.push(sym);
      }
    }

    if (unused.length > 0) {
      result.set(file.path, unused);
    }
  }

  return result;
}

/**
 * Get relative-path keyed version for output.
 */
export function unusedExportsToRelative(
  map: Map<string, string[]>,
  root: string,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [abs, syms] of map) {
    result[path.relative(root, abs)] = syms;
  }
  return result;
}
