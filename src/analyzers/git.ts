import { execSync } from 'node:child_process';
import path from 'node:path';
import type { FileInfo } from './base.js';

export interface GitRiskEntry {
  churn: number;      // number of commits touching this file
  riskScore: number;  // churn * log(importedByCount + 1)
}

/**
 * Get commit count for a single file. Returns 0 if git unavailable or file untracked.
 */
function getGitChurn(root: string, filePath: string): number {
  try {
    const rel = path.relative(root, filePath);
    const out = execSync(`git -C "${root}" log --oneline -- "${rel}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    return out.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * Check if directory is a git repo.
 */
function isGitRepo(root: string): boolean {
  try {
    execSync(`git -C "${root}" rev-parse --git-dir`, { stdio: 'pipe', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Analyze git churn and risk score for all files.
 * Falls back gracefully if not a git repo.
 */
export function analyzeGitRisk(
  root: string,
  files: FileInfo[],
  importedByCount: Map<string, number>,
): Map<string, GitRiskEntry> {
  const result = new Map<string, GitRiskEntry>();

  if (!isGitRepo(root)) return result;

  for (const file of files) {
    const churn = getGitChurn(root, file.path);
    const fanOut = importedByCount.get(file.path) ?? 0;
    const riskScore = Math.round(churn * Math.log(fanOut + 1) * 10) / 10;
    result.set(file.path, { churn, riskScore });
  }

  return result;
}
