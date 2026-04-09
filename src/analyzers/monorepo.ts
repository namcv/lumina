import fs from 'node:fs';
import path from 'node:path';

/**
 * Detect sub-package roots in a monorepo.
 * Supports: pnpm workspaces, yarn/npm workspaces, lerna.
 * Returns absolute paths of each sub-package root (excluding root itself).
 */
export function detectMonorepo(root: string): string[] {
  const packages: string[] = [];

  // 1. pnpm-workspace.yaml
  const pnpmWs = path.join(root, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmWs)) {
    const content = fs.readFileSync(pnpmWs, 'utf-8');
    const globs = extractYamlPackages(content);
    packages.push(...resolveGlobs(root, globs));
  }

  // 2. package.json workspaces field (yarn/npm)
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const ws: string[] = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : Array.isArray(pkg.workspaces?.packages)
          ? pkg.workspaces.packages
          : [];
      packages.push(...resolveGlobs(root, ws));
    } catch { /* ignore */ }
  }

  // 3. lerna.json
  const lernaPath = path.join(root, 'lerna.json');
  if (fs.existsSync(lernaPath)) {
    try {
      const lerna = JSON.parse(fs.readFileSync(lernaPath, 'utf-8'));
      const pkgs: string[] = lerna.packages ?? ['packages/*'];
      packages.push(...resolveGlobs(root, pkgs));
    } catch { /* ignore */ }
  }

  // Deduplicate and exclude root
  return [...new Set(packages)].filter((p) => p !== root && fs.existsSync(path.join(p, 'package.json')));
}

/**
 * Returns true if the root looks like a monorepo.
 */
export function isMonorepo(root: string): boolean {
  return detectMonorepo(root).length > 0;
}

/**
 * Get package name from package.json, fallback to dir basename.
 */
export function getPackageName(pkgRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf-8'));
    return pkg.name ?? path.basename(pkgRoot);
  } catch {
    return path.basename(pkgRoot);
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function extractYamlPackages(yaml: string): string[] {
  // Simple extraction: lines under "packages:" that start with "  - "
  const result: string[] = [];
  let inPackages = false;
  for (const line of yaml.split('\n')) {
    if (line.trim().startsWith('packages:')) { inPackages = true; continue; }
    if (inPackages) {
      const m = line.match(/^\s+-\s+['"]?([^'"#\s]+)['"]?/);
      if (m) result.push(m[1]);
      else if (line.trim() && !line.trim().startsWith('#')) inPackages = false;
    }
  }
  return result;
}

function resolveGlobs(root: string, patterns: string[]): string[] {
  const results: string[] = [];
  for (const pattern of patterns) {
    // Handle simple globs: packages/*, apps/*
    const clean = pattern.replace(/\/\*\*?$/, '');
    const base = path.resolve(root, clean.replace(/\*$/, ''));
    // If pattern ends with *, list subdirs
    if (pattern.includes('*')) {
      try {
        const entries = fs.readdirSync(base, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) results.push(path.join(base, e.name));
        }
      } catch { /* skip */ }
    } else {
      results.push(path.resolve(root, pattern));
    }
  }
  return results;
}
