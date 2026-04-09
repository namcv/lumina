import fs from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';

const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const DEFAULT_IGNORE = [
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'out',
  'coverage',
  '.git',
  '*.min.js',
  '*.d.ts',
];

function loadGitignore(root: string): Ignore {
  const ig = ignore();
  ig.add(DEFAULT_IGNORE);

  const gitignorePath = path.join(root, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    ig.add(content);
  }

  return ig;
}

/**
 * Recursively walk a directory and return all supported source files.
 * Respects .gitignore and skips common non-source directories.
 */
export function walkFiles(root: string): string[] {
  const ig = loadGitignore(root);
  const files: string[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(root, fullPath);

      if (ig.ignores(rel)) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(root);
  return files;
}

/**
 * Resolve a relative import path from a source file to an absolute path.
 * Returns null if the import is not a local file (e.g., npm package).
 */
export function resolveImport(fromFile: string, importPath: string, root: string): string | null {
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null; // external package
  }

  const fromDir = path.dirname(fromFile);
  const resolved = path.resolve(fromDir, importPath);

  // Try exact match first, then with extensions
  const exts = Array.from(SUPPORTED_EXTENSIONS);

  // Handle TypeScript's .js → .ts remapping (import './foo.js' resolves to './foo.ts')
  const tsRemapped = resolved.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx');

  const candidates = [
    resolved,
    tsRemapped,
    ...exts.map((ext) => resolved + ext),
    ...exts.map((ext) => path.join(resolved, `index${ext}`)),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}
