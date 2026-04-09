# Lumina

> Illuminate your codebase — auto-generate source maps and architecture context for Claude Code

Lumina analyzes your React or NestJS repository and produces a rich dependency graph, CLAUDE.md context file, and interactive visualizations — giving Claude Code a complete understanding of your architecture before it touches a single line of code.

---

## Features

- **Source map** — file-level dependency graph with import/export relationships
- **CLAUDE.md** — auto-generated architecture context Claude Code reads automatically
- **Interactive graph** — D3.js force/cluster/heatmap visualization with macOS-style UI
- **Circular dependency detection** — find and highlight dependency cycles
- **Complexity & risk scoring** — per-file metrics based on imports, LOC, and git churn
- **Dead code detection** — unused exports across the codebase
- **Duplicate component detection** — same-named components at different paths
- **Git risk analysis** — files with high churn × high fan-in flagged as risky
- **Architecture health report** — HEALTH.md with actionable insights
- **PR impact comment** — blast radius of changed files for pull request descriptions
- **Per-file context** — detailed context block for piping into Claude prompts
- **Monorepo support** — pnpm workspaces, Yarn workspaces, Lerna
- **API contract matching** — match frontend HTTP calls against backend NestJS routes

---

## Installation

```bash
npm install -g lumina
# or use without installing
npx lumina analyze ./my-repo
```

---

## Quick Start

```bash
# Analyze your repo
lumina analyze ./my-repo

# Open interactive dependency graph
lumina graph -r ./my-repo --open

# Generate architecture health report
lumina analyze ./my-repo --health
```

After running `analyze`, Claude Code will automatically read `CLAUDE.md` at the root of your project and have full architectural context.

---

## CLI Commands

### `analyze [path]`

Analyze a repository and generate `CLAUDE.md` + `.claude/source-map.json`.

```bash
lumina analyze ./my-repo
lumina analyze ./my-repo --health        # also write HEALTH.md
lumina analyze ./my-repo --skip-git      # skip git churn analysis (faster)
lumina analyze ./my-repo --skip-unused   # skip unused export analysis (faster)
lumina analyze ./my-repo -o ./output     # custom output directory
```

### `graph`

Generate an interactive D3.js HTML dependency graph.

```bash
lumina graph -r ./my-repo --open         # open in browser after generating
lumina graph -r ./my-repo --min 2        # only show files imported by ≥2 others
lumina graph -r ./my-repo -o graph.html  # custom output path
```

**Graph modes:**
- **Force** — standard force-directed layout
- **Cluster** — group nodes by type (component, hook, service, etc.)
- **Import heat** — heatmap by number of importers
- **Complexity** — heatmap by complexity score
- **Risk** — heatmap by git risk score

### `impact`

Show which files are impacted when a given file changes.

```bash
lumina impact --file src/services/auth.service.ts
lumina impact --file src/services/auth.service.ts -o impact.md
```

### `context`

Generate a detailed context block for a specific file — useful for piping into Claude prompts.

```bash
lumina context --file src/services/auth.service.ts
lumina context --file src/services/auth.service.ts -o context.md
```

Output example:
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
lumina pr-comment                        # diff against main
lumina pr-comment --base develop         # diff against develop
lumina pr-comment -o comment.md          # save to file
```

### `api-match`

Match frontend HTTP calls against backend NestJS routes to find mismatches.

```bash
lumina api-match --frontend ./frontend --backend ./backend
lumina api-match --frontend ./frontend --backend ./backend -o report.md
```

Output:
```
Frontend calls : 142
Backend routes : 138
✅ Matched     : 121
❌ Unmatched FE: 21   ← potential 404s
🔇 Dead routes : 17   ← unused backend endpoints
```

### `init`

Set up Claude Code hooks to auto-regenerate source maps on file changes.

```bash
lumina init -r ./my-repo
```

---

## Library Usage

Lumina can also be used programmatically:

```ts
import { analyze, generateGraph, calculateImpact } from 'lumina';

// Analyze a repo
const result = await analyze({ root: './my-repo' });
console.log(result.sourceMap.cycles);       // circular deps
console.log(result.sourceMap.duplicates);   // duplicate components

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
| `HEALTH.md` | Architecture health report (with `--health` flag) |

---

## Supported Frameworks

| Framework | Detection |
|-----------|-----------|
| React | Components, hooks, context, JSX |
| NestJS | Modules, controllers, services, decorators |
| HTTP clients | axios, fetch, umi-request (string + object style), useQuery/useMutation |

---

## Scores Explained

**Complexity score** = `imports × 0.3 + importedBy × 0.5 + httpCalls × 0.8 + LOC / 100`

**Risk score** = `gitChurn × log(importedBy + 1)` — files changed often with many dependents

---

## License

MIT
