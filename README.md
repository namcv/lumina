# Lumina

> Illuminate your codebase — auto-generate source maps and architecture context for Claude Code

Lumina analyzes your React or NestJS repository and produces a rich dependency graph, `CLAUDE.md` context file, and interactive visualizations — giving Claude Code a complete understanding of your architecture before it touches a single line of code.

---

## Installation

```bash
# Global install
npm install -g @namcv/lumina

# Per-project (recommended)
npm install @namcv/lumina --save-dev

# Or run without installing
npx @namcv/lumina <command>
```

---

## Quick Start

```bash
# 1. Initialize in your project — sets up CLAUDE.md, hooks, and /lumina-review skill
npx lumina init

# 2. Open interactive dependency graph
npx lumina graph --open

# 3. Review an MR using /lumina-review in Claude Code
/lumina-review develop
```

---

## Code Review Workflow

The key feature of Lumina: instead of asking Claude to scan your entire codebase, `/lumina-review` generates a **focused review context** containing only files that matter — with a built-in checklist guiding Claude on what to look for.

### Setup (one time)

```bash
npx @namcv/lumina init
```

This creates `.claude/commands/lumina-review.md` — a Claude Code slash command available immediately.

### Usage inside Claude Code

```
/lumina-review                                              # review vs main (default)
/lumina-review develop                                      # diff develop...HEAD
/lumina-review feat/my-feature main                         # source vs target branch
/lumina-review HEAD~3                                       # review last 3 commits
/lumina-review https://github.com/owner/repo/pull/123      # from GitHub PR URL
/lumina-review https://gitlab.com/group/proj/-/merge_requests/456  # from GitLab MR URL
```

Claude will automatically:
1. Run `lumina review` to compute the impact scope
2. Read only the changed + impacted files
3. Follow a structured checklist covering correctness, security, performance, design, and test coverage
4. Report findings grouped by file with severity labels and fix suggestions

### What's in the review context

```
## Instructions for Claude

### Review Checklist
**Correctness** — logic errors, null dereference, async misuse, race conditions
**Security**    — XSS, token exposure, missing auth checks
**Performance** — unnecessary re-renders, N+1 calls, missing useEffect cleanup
**Design**      — naming, anti-patterns, TypeScript types, hardcoded strings
**Tests**       — mock accuracy, edge cases covered

### Output Format
- 🔴 Bug | 🟡 Design | 🟢 Minor
- Code snippet + explanation + suggested fix
- Summary table + must-fix-before-merge list

## Token Estimate
| | Lumina review | Full repo scan |
|---|---|---|
| Files | 7 | 716 |
| Input tokens | ~15,449 | ~1,197,376 |
| Est. cost (Sonnet $3/MTok) | ~$0.05 | ~$3.59 |
| Tokens saved | | ~1,181,927 (99%) |
```

After running `lumina analyze`, Claude Code will also automatically read `CLAUDE.md` for full architecture context on every conversation.

---

## Features

- **CLAUDE.md generation** — architecture context Claude Code reads automatically
- **Source map** — file-level dependency graph with import/export relationships
- **Focused MR review** — BFS impact tracing to find exactly which files to review
- **Interactive graph** — D3.js visualization with Force / Cluster / Heatmap modes and macOS-style UI
- **Circular dependency detection** — find and highlight dependency cycles
- **Complexity & risk scoring** — per-file metrics based on imports, LOC, and git churn
- **Dead code detection** — unused exports and components across the codebase
- **Duplicate component detection** — same-named files at different paths
- **Git risk analysis** — files with high churn × high fan-in flagged as risky
- **Architecture health report** — actionable HEALTH.md with insights
- **PR impact comment** — blast radius of changed files for pull request descriptions
- **Per-file context** — detailed context block for piping into Claude prompts
- **Monorepo support** — pnpm workspaces, Yarn workspaces, Lerna
- **API contract matching** — match frontend HTTP calls against backend NestJS routes

---

## CLI Commands

### `analyze [path]`

Analyze a repository and generate `CLAUDE.md` + `.claude/source-map.json`.

```bash
lumina analyze ./my-repo
lumina analyze ./my-repo --health      # also write HEALTH.md
lumina analyze ./my-repo --skip-git    # skip git churn (faster)
lumina analyze ./my-repo --skip-unused # skip unused export analysis (faster)
```

### `review`

Generate a focused review context for Claude — lists changed files + their impact chain.

```bash
# By branch name (source vs target)
lumina review feat/my-feature main            # source branch vs target branch
lumina review feat/my-feature develop         # source vs develop

# Legacy: single arg = diff against HEAD
lumina review develop                         # diff develop...HEAD

# From GitHub PR or GitLab MR URL
lumina review --mr https://github.com/owner/repo/pull/123
lumina review --mr https://gitlab.com/group/project/-/merge_requests/456

# Output options
lumina review feat/x main -o .claude/review-context.md
lumina review --mr <url> --json               # output as JSON
```

Set `GITHUB_TOKEN` or `GITLAB_TOKEN` env vars for private repositories when using `--mr`.

### `graph`

Generate an interactive D3.js HTML dependency graph.

```bash
lumina graph -r ./my-repo --open       # open in browser after generating
lumina graph -r ./my-repo --min 2      # only show files imported by ≥2 others
```

**Graph modes:** Force · Cluster · Import heat · Complexity · Risk

### `impact`

Show which files are affected when a given file changes.

```bash
lumina impact --file src/services/auth.service.ts -r ./my-repo
lumina impact --file src/services/auth.service.ts -o impact.md
```

### `context`

Generate a detailed context block for a specific file — paste into Claude prompts.

```bash
lumina context --file src/services/auth.service.ts -r ./my-repo
```

```
## Context: src/services/auth.service.ts
- Type: nestjs-service
- Complexity: 12.4 | Risk score: 87 | Git churn: 23 commits
- Imported by: 8 files
- Imports: 5 files
- HTTP calls: 3 endpoints
- Cycles: none
```

### `pr-comment`

Generate a PR impact comment from the current git diff.

```bash
lumina pr-comment --base main
lumina pr-comment --base develop -o comment.md
```

### `api-match`

Match frontend HTTP calls against backend NestJS routes to find mismatches.

```bash
lumina api-match --frontend ./frontend --backend ./backend
```

```
Frontend calls : 142
Backend routes : 138
✅ Matched     : 121
❌ Unmatched FE : 21   ← potential 404s
🔇 Dead routes  : 17   ← unused backend endpoints
```

### `init`

One-time setup: runs initial analysis, configures PostToolUse hooks, and creates the `/lumina-review` Claude Code skill.

```bash
# In your project root
npx lumina init

# Or for a specific directory
npx lumina init -r ./my-repo
```

After running `init`, Claude Code will have:
- `CLAUDE.md` — architecture context (auto-read by Claude Code)
- `.claude/source-map.json` — dependency graph
- `.claude/commands/lumina-review.md` — `/lumina-review` slash command with the **project root baked in**
- Auto-regeneration hook on every file edit

> The generated `.claude/commands/lumina-review.md` has the absolute path of the project hardcoded as the default `--root`, so `/lumina-review` always targets the correct repo regardless of which directory Claude Code is launched from.

### `/lumina-review` — Claude Code slash command

After `lumina init`, use this directly inside Claude Code:

```
/lumina-review                                                    # review vs main (default)
/lumina-review develop                                            # diff develop...HEAD
/lumina-review feat/my-feature main                               # source vs target branch
/lumina-review HEAD~3                                             # review last 3 commits
/lumina-review https://github.com/owner/repo/pull/123            # from GitHub PR URL
/lumina-review https://gitlab.com/group/project/-/merge_requests/456  # from GitLab MR URL

# Override root on the fly (useful with the global skill)
/lumina-review --root ./other-repo feat/my-feature main
```

Set `GITHUB_TOKEN` or `GITLAB_TOKEN` env vars for private repositories when using a URL.

Claude will automatically run `lumina review`, read the impact scope, and review only the relevant files — not the entire codebase.

---

## Library API

Lumina can be used programmatically in Node.js scripts:

```ts
import { analyze, generateGraph, calculateImpact } from '@namcv/lumina';

// Analyze a repo
const result = await analyze({ root: './my-repo' });

console.log(result.sourceMap.cycles);     // circular dependencies
console.log(result.sourceMap.duplicates); // duplicate components

// Calculate blast radius of a changed file
const impact = calculateImpact('src/utils/api.ts', result.sourceMap);

// Generate interactive graph
await generateGraph({ root: './my-repo', outputPath: './graph.html' });
```

---

## Output Files

| File | Description |
|------|-------------|
| `CLAUDE.md` | Architecture context — auto-read by Claude Code |
| `.claude/source-map.json` | Machine-readable dependency graph |
| `.claude/graph.html` | Interactive D3.js visualization |
| `.claude/review-context.md` | Focused MR review scope (`review` command) |
| `HEALTH.md` | Architecture health report (`--health` flag) |

---

## Supported Frameworks

| | Detection |
|-|-----------|
| **React** | Components, hooks, context, JSX |
| **NestJS** | Modules, controllers, services, decorators |
| **HTTP clients** | axios, fetch, umi-request (string + object style), useQuery / useMutation |

---

## Scores Explained

| Score | Formula |
|-------|---------|
| **Complexity** | `imports × 0.3 + importedBy × 0.5 + httpCalls × 0.8 + LOC / 100` |
| **Risk** | `gitChurn × log(importedBy + 1)` |

Risk highlights files that are changed often **and** have many dependents — the most dangerous files to modify carelessly.

---

## Requirements

- Node.js ≥ 18
- Git (optional — required for churn/risk analysis)

---

## License

MIT © [namcv](https://github.com/namcv)
