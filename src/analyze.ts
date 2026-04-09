import fs from 'node:fs';
import path from 'node:path';
import { analyzeFiles } from './analyzers/base.js';
import { analyzeReactFiles } from './analyzers/react.js';
import { analyzeNestJSFiles } from './analyzers/nestjs.js';
import { analyzeHttpCalls } from './analyzers/http.js';
import { analyzeUnusedExports, unusedExportsToRelative } from './analyzers/exports.js';
import { analyzeGitRisk } from './analyzers/git.js';
import { detectMonorepo, getPackageName, isMonorepo } from './analyzers/monorepo.js';
import { generateClaudeMd } from './generators/claude-md.js';
import { generateGraph } from './generators/graph.js';
import type { ReactInfo } from './analyzers/react.js';
import type { NestJSInfo } from './analyzers/nestjs.js';
import type { SourceMapOutput } from './generators/graph.js';

export interface AnalyzeOptions {
  root?: string;
  frameworks?: Array<'react' | 'nestjs'>;
  outputDir?: string;
  writeClaudeMd?: boolean;
  /** Skip git churn analysis (faster, useful in CI) */
  skipGit?: boolean;
  /** Skip unused export analysis (slower on large repos) */
  skipUnusedExports?: boolean;
  /** Force monorepo mode */
  monorepo?: boolean;
}

export interface AnalyzeResult {
  root: string;
  frameworks: string[];
  reactInfo?: ReactInfo;
  nestjsInfo?: NestJSInfo;
  sourceMap: SourceMapOutput;
  claudeMd: string;
  outputDir: string;
}

export async function analyze(options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const outputDir = options.outputDir ?? path.join(root, '.claude');

  // ── Monorepo detection ────────────────────────────────────────────────────
  const monorepoMode = options.monorepo ?? isMonorepo(root);
  const subPackages = monorepoMode ? detectMonorepo(root) : [];

  // Build packageMap: filePath → packageName (for monorepo cluster display)
  const packageMap = new Map<string, string>();
  if (monorepoMode && subPackages.length > 0) {
    for (const pkgRoot of subPackages) {
      const pkgName = getPackageName(pkgRoot);
      // We'll tag files after walking, using prefix match
      packageMap.set(pkgRoot, pkgName);
    }
  }

  // ── File analysis + dependency graph ─────────────────────────────────────
  const { graph, files } = analyzeFiles(root);

  // Tag files with their package (monorepo)
  const filePackageMap = new Map<string, string>();
  if (monorepoMode) {
    for (const file of files) {
      for (const [pkgRoot, pkgName] of packageMap) {
        if (file.path.startsWith(pkgRoot + path.sep)) {
          filePackageMap.set(file.path, pkgName);
          break;
        }
      }
    }
  }

  // ── Framework detection ───────────────────────────────────────────────────
  const frameworks = options.frameworks ?? detectFrameworks(root);

  // ── Framework-specific analysis ───────────────────────────────────────────
  let reactInfo: ReactInfo | undefined;
  let nestjsInfo: NestJSInfo | undefined;
  if (frameworks.includes('react')) reactInfo = analyzeReactFiles(files);
  if (frameworks.includes('nestjs')) nestjsInfo = analyzeNestJSFiles(files, root);

  // ── HTTP calls ────────────────────────────────────────────────────────────
  const httpMap = analyzeHttpCalls(files);

  // ── Duplicate detector ────────────────────────────────────────────────────
  const duplicates = detectDuplicates(files);

  // ── Unused exports ────────────────────────────────────────────────────────
  let unusedExportsMap: Record<string, string[]> = {};
  if (!options.skipUnusedExports) {
    const rawMap = analyzeUnusedExports(files);
    unusedExportsMap = unusedExportsToRelative(rawMap, root);
  }

  // ── Git risk ──────────────────────────────────────────────────────────────
  let gitRiskMap = new Map<string, import('./analyzers/git.js').GitRiskEntry>();
  if (!options.skipGit) {
    const importedByCount = new Map(files.map((f) => [f.path, graph.getImportedBy(f.path).length]));
    gitRiskMap = analyzeGitRisk(root, files, importedByCount);
  }

  // ── Generate outputs ──────────────────────────────────────────────────────
  const sourceMap = generateGraph({
    root, graph, files, frameworks,
    httpMap, unusedExportsMap, gitRiskMap, duplicates,
    packageMap: filePackageMap.size > 0 ? filePackageMap : undefined,
  });

  const claudeMd = generateClaudeMd({ root, files, graph, reactInfo, nestjsInfo, frameworks });

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'source-map.json'), JSON.stringify(sourceMap, null, 2), 'utf-8');

  if (options.writeClaudeMd !== false) {
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), claudeMd, 'utf-8');
  }

  return { root, frameworks, reactInfo, nestjsInfo, sourceMap, claudeMd, outputDir };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectFrameworks(root: string): Array<'react' | 'nestjs'> {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const frameworks: Array<'react' | 'nestjs'> = [];
    if ('react' in deps) frameworks.push('react');
    if ('@nestjs/core' in deps || '@nestjs/common' in deps) frameworks.push('nestjs');
    return frameworks;
  } catch {
    return [];
  }
}

function detectDuplicates(files: import('./analyzers/base.js').FileInfo[]): Array<{ name: string; files: string[] }> {
  const byName = new Map<string, string[]>();
  for (const file of files) {
    const name = path.basename(file.path, path.extname(file.path));
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(file.relativePath);
  }
  return Array.from(byName.entries())
    .filter(([, paths]) => paths.length > 1)
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => b.files.length - a.files.length);
}
