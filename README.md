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

The key feature of Lumina: instead of asking Claude to scan your entire codebase, generate a **focused review context** that contains only the files that matter for a given MR.

```bash
# Generate review context for current branch vs main
lumina review --base main

# Save to file and paste into Claude Code
lumina review --base main -o .claude/review-context.md
```

Example output:
```
## Changed Files (32)
| File | Type | Complexity | Risk |
| src/helper/utils.ts | unknown | 13.4 | 🔥 High |
| src/common/constant.ts | unknown | 5.3 | 🔥 High |
...

## Impacted Files (13)
> These files import the changed files and may be affected.
...

Total files to review: 45 (32 changed + 13 impacted)
vs full repo: 716 files — saving 94% scan effort
```

Paste the output into Claude Code with:
```
<review-context>
[paste review-context.md content here]
</review-context>

Please review this MR. Only look at the files listed above.
```

After running `lumina analyze`, Claude Code will automatically read `CLAUDE.md` and follow the correct review workflow for every conversation.

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
lumina review                          # diff against main
lumina review --base develop           # diff against develop
lumina review --base main -o .claude/review-context.md
lumina review --json                   # output as JSON
```

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
- `.claude/commands/lumina-review.md` — `/lumina-review` slash command
- Auto-regeneration hook on every file edit

### `/lumina-review` — Claude Code slash command

After `lumina init`, use this directly inside Claude Code:

```
/lumina-review              review against main (default)
/lumina-review develop      review against develop
/lumina-review HEAD~3       review last 3 commits
```

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
