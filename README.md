# Lumina

> Illuminate your codebase — auto-generate source maps and architecture context for Claude Code

Lumina analyzes your React or NestJS repository and produces a rich dependency graph, `CLAUDE.md` context file, and interactive visualizations — giving Claude Code a complete understanding of your architecture before it touches a single line of code.

---

## Installation

```bash
# Use as CLI (global)
npm install -g @namcv/lumina

# Or use without installing
npx @namcv/lumina analyze ./my-repo

# Or as a dev dependency
npm install @namcv/lumina --save-dev
```

---

## Quick Start

```bash
# Analyze your repo — generates CLAUDE.md + source-map.json
lumina analyze ./my-repo

# Open interactive dependency graph in browser
lumina graph -r ./my-repo --open

# Generate architecture health report
lumina analyze ./my-repo --health
```

After running `analyze`, Claude Code will automatically read `CLAUDE.md` at your project root and have full architectural context for every conversation.

---

## Features

- **CLAUDE.md generation** — architecture context Claude Code reads automatically
- **Source map** — file-level dependency graph with import/export relationships
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
lumina analyze ./my-repo -o ./output   # custom output directory
```

### `graph`

Generate an interactive D3.js HTML dependency graph.

```bash
lumina graph -r ./my-repo --open       # open in browser after generating
lumina graph -r ./my-repo --min 2      # only show files imported by ≥2 others
lumina graph -r ./my-repo -o graph.html
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
lumina pr-comment                  # diff against main
lumina pr-comment --base develop   # diff against develop
lumina pr-comment -o comment.md
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

Set up hooks to auto-regenerate source maps when files change.

```bash
lumina init -r ./my-repo
```

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
