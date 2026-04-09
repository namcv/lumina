// src/analyze.ts
import fs8 from "fs";
import path9 from "path";

// src/analyzers/base.ts
import fs2 from "fs";
import path2 from "path";

// src/utils/dep-graph.ts
var DepGraph = class {
  constructor() {
    /** file → files it imports */
    this.edges = /* @__PURE__ */ new Map();
    /** file → files that import it (reverse) */
    this.reverseEdges = /* @__PURE__ */ new Map();
  }
  addFile(file) {
    if (!this.edges.has(file)) this.edges.set(file, /* @__PURE__ */ new Set());
    if (!this.reverseEdges.has(file)) this.reverseEdges.set(file, /* @__PURE__ */ new Set());
  }
  addEdge(from, to) {
    this.addFile(from);
    this.addFile(to);
    this.edges.get(from).add(to);
    this.reverseEdges.get(to).add(from);
  }
  getImports(file) {
    return Array.from(this.edges.get(file) ?? []);
  }
  getImportedBy(file) {
    return Array.from(this.reverseEdges.get(file) ?? []);
  }
  getAllFiles() {
    return Array.from(this.edges.keys());
  }
  /**
   * BFS upward: find all files transitively affected when `file` changes.
   * Returns result sorted by depth (most directly affected first).
   */
  getImpacted(file) {
    const visited = /* @__PURE__ */ new Map();
    const queue = [[file, 0]];
    while (queue.length > 0) {
      const [current, depth] = queue.shift();
      if (visited.has(current)) continue;
      visited.set(current, depth);
      for (const parent of this.getImportedBy(current)) {
        if (!visited.has(parent)) {
          queue.push([parent, depth + 1]);
        }
      }
    }
    return Array.from(visited.entries()).filter(([f]) => f !== file).map(([f, d]) => ({ file: f, depth: d })).sort((a, b) => a.depth - b.depth);
  }
  /**
   * DFS-based cycle detection.
   * Returns array of cycles, each cycle is the list of files forming the loop.
   */
  detectCycles() {
    const visited = /* @__PURE__ */ new Set();
    const stack = /* @__PURE__ */ new Set();
    const stackArr = [];
    const cycles = [];
    const dfs = (node) => {
      visited.add(node);
      stack.add(node);
      stackArr.push(node);
      for (const neighbor of this.getImports(node)) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (stack.has(neighbor)) {
          const cycleStart = stackArr.indexOf(neighbor);
          cycles.push(stackArr.slice(cycleStart).concat(neighbor));
        }
      }
      stack.delete(node);
      stackArr.pop();
    };
    for (const file of this.edges.keys()) {
      if (!visited.has(file)) dfs(file);
    }
    return cycles;
  }
  toJSON() {
    const result = {};
    for (const file of this.edges.keys()) {
      result[file] = {
        imports: this.getImports(file),
        importedBy: this.getImportedBy(file)
      };
    }
    return result;
  }
};

// src/utils/file-walker.ts
import fs from "fs";
import path from "path";
import ignore from "ignore";
var SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
var DEFAULT_IGNORE = [
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "out",
  "coverage",
  ".git",
  "*.min.js",
  "*.d.ts"
];
function loadGitignore(root) {
  const ig = ignore();
  ig.add(DEFAULT_IGNORE);
  const gitignorePath = path.join(root, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    ig.add(content);
  }
  return ig;
}
function walkFiles(root) {
  const ig = loadGitignore(root);
  const files = [];
  function walk(dir) {
    let entries;
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
function resolveImport(fromFile, importPath, root) {
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return null;
  }
  const fromDir = path.dirname(fromFile);
  const resolved = path.resolve(fromDir, importPath);
  const exts = Array.from(SUPPORTED_EXTENSIONS);
  const tsRemapped = resolved.replace(/\.js$/, ".ts").replace(/\.jsx$/, ".tsx");
  const candidates = [
    resolved,
    tsRemapped,
    ...exts.map((ext) => resolved + ext),
    ...exts.map((ext) => path.join(resolved, `index${ext}`))
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

// src/analyzers/base.ts
var IMPORT_RE = /(?:import|export)\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)|import\(['"]([^'"]+)['"]\)/g;
function extractImports(content) {
  const imports = [];
  let match;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const importPath = match[1] ?? match[2] ?? match[3];
    if (importPath) imports.push(importPath);
  }
  return imports;
}
function analyzeFiles(root) {
  const allFiles = walkFiles(root);
  const graph = new DepGraph();
  const files = [];
  for (const file of allFiles) {
    graph.addFile(file);
  }
  for (const file of allFiles) {
    let content;
    try {
      content = fs2.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const importPaths = extractImports(content);
    const resolvedImports = [];
    for (const importPath of importPaths) {
      const resolved = resolveImport(file, importPath, root);
      if (resolved) {
        graph.addEdge(file, resolved);
        resolvedImports.push(resolved);
      }
    }
    files.push({
      path: file,
      relativePath: path2.relative(root, file),
      imports: resolvedImports,
      linesOfCode: content.split("\n").length,
      type: "unknown"
    });
  }
  return { graph, files };
}

// src/analyzers/react.ts
import fs3 from "fs";
var REACT_COMPONENT_RE = /(?:export\s+default\s+function|export\s+(?:default\s+)?(?:const|function)\s+[A-Z])/;
var JSX_RE = /(?:<[A-Z][a-zA-Z]*|<\/[A-Z]|React\.createElement)/;
var HOOK_RE = /(?:export\s+(?:default\s+)?(?:const|function)\s+(use[A-Z][a-zA-Z]*))/;
var CONTEXT_RE = /(?:createContext|React\.createContext)/;
var ROUTER_RE = /(?:from\s+['"]react-router|<Route\s|<Link\s|<BrowserRouter|<Switch)/;
function analyzeReactFiles(files) {
  const info = {
    components: [],
    hooks: [],
    contexts: [],
    hasRouter: false
  };
  for (const file of files) {
    const isTsx = file.path.endsWith(".tsx");
    let content;
    try {
      content = fs3.readFileSync(file.path, "utf-8");
    } catch {
      continue;
    }
    const hasJsx = isTsx || JSX_RE.test(content);
    const hasContext = CONTEXT_RE.test(content);
    const hookMatch = content.match(HOOK_RE);
    if (hookMatch) {
      file.type = "react-hook";
      info.hooks.push(file.relativePath);
      continue;
    }
    if (hasContext) {
      file.type = "react-context";
      info.contexts.push(file.relativePath);
      continue;
    }
    if (hasJsx && REACT_COMPONENT_RE.test(content)) {
      file.type = "react-component";
      info.components.push(file.relativePath);
    }
    if (ROUTER_RE.test(content)) {
      info.hasRouter = true;
    }
  }
  return info;
}

// src/analyzers/nestjs.ts
import fs4 from "fs";
import path3 from "path";
var MODULE_RE = /@Module\s*\(/;
var CONTROLLER_RE = /@Controller\s*\(/;
var INJECTABLE_RE = /@Injectable\s*\(/;
var GUARD_RE = /@(?:CanActivate|UseGuards)\s*\(|implements\s+CanActivate/;
var INTERCEPTOR_RE = /@(?:UseInterceptors|NestInterceptor)\s*\(|implements\s+NestInterceptor/;
var PIPE_RE = /@(?:UsePipes|PipeTransform)\s*\(|implements\s+PipeTransform/;
function analyzeNestJSFiles(files, root) {
  const info = {
    modules: [],
    controllers: [],
    services: [],
    guards: [],
    interceptors: [],
    pipes: []
  };
  for (const file of files) {
    if (!file.path.endsWith(".ts") && !file.path.endsWith(".js")) continue;
    let content;
    try {
      content = fs4.readFileSync(file.path, "utf-8");
    } catch {
      continue;
    }
    if (MODULE_RE.test(content)) {
      file.type = "nestjs-module";
      const name = extractClassName(content) ?? path3.basename(file.path, path3.extname(file.path));
      info.modules.push({
        name,
        file: file.relativePath,
        controllers: extractArrayItems(content, "controllers"),
        providers: extractArrayItems(content, "providers")
      });
      continue;
    }
    if (CONTROLLER_RE.test(content)) {
      file.type = "nestjs-controller";
      info.controllers.push(file.relativePath);
      continue;
    }
    if (GUARD_RE.test(content)) {
      file.type = "nestjs-guard";
      info.guards.push(file.relativePath);
      continue;
    }
    if (INTERCEPTOR_RE.test(content)) {
      file.type = "nestjs-interceptor";
      info.interceptors.push(file.relativePath);
      continue;
    }
    if (PIPE_RE.test(content)) {
      file.type = "nestjs-pipe";
      info.pipes.push(file.relativePath);
      continue;
    }
    if (INJECTABLE_RE.test(content)) {
      file.type = "nestjs-service";
      info.services.push(file.relativePath);
    }
  }
  return info;
}
function extractClassName(content) {
  const match = content.match(/export\s+class\s+(\w+)/);
  return match?.[1] ?? null;
}
function extractArrayItems(content, key) {
  const re = new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)]`);
  const match = content.match(re);
  if (!match) return [];
  return match[1].split(",").map((s) => s.trim()).filter((s) => s.length > 0 && !s.startsWith("//"));
}

// src/analyzers/http.ts
import fs5 from "fs";
var AXIOS_CALL_RE = /axios\s*\.\s*(?:get|post|put|delete|patch|head)\s*\(\s*['"`]([^'"`\n]+)['"`]/gi;
var FETCH_CALL_RE = /\bfetch\s*\(\s*['"`]([^'"`\n]+)['"`]/gi;
var UMI_REQUEST_STR_RE = /\brequest\s*\(\s*['"`]([^'"`\n]+)['"`]/gi;
var UMI_REQUEST_OBJ_RE = /\brequest\s*\(\s*\{[^}]*url\s*:\s*([^\s,}\n]+)[^}]*\}/gi;
var UMI_METHOD_RE = /method\s*:\s*['"](\w+)['"]/i;
var INST_CALL_RE = /\b\w+\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"`](\/[^'"`\n]*)['"`]/gi;
var USE_QUERY_RE = /\buse(?:Query|InfiniteQuery|Mutation)\s*\(/g;
var NEST_ROUTE_RE = /@(Get|Post|Put|Delete|Patch|Head|Options|All)\s*\(\s*['"`]?([^'"`\n\)]*?)['"`]?\s*\)/gi;
var NEST_CTRL_RE = /@Controller\s*\(\s*['"`]?([^'"`\n\)]*?)['"`]?\s*\)/i;
function detectHttpCalls(filePath) {
  let content;
  try {
    content = fs5.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  const calls = [];
  const nestjsRoutes = [];
  for (const m of matchAll(content, AXIOS_CALL_RE)) {
    calls.push({ method: extractMethod(m[0]), url: normalizeUrl(m[1]), pattern: "axios" });
  }
  for (const m of matchAll(content, FETCH_CALL_RE)) {
    if (m[1].startsWith("/") || m[1].startsWith("http") || m[1].includes("api")) {
      calls.push({ method: "GET", url: normalizeUrl(m[1]), pattern: "fetch" });
    }
  }
  for (const m of matchAll(content, UMI_REQUEST_STR_RE)) {
    if (m[1].startsWith("/") || m[1].includes("api")) {
      calls.push({ method: extractMethodFromContext(content, m.index), url: normalizeUrl(m[1]), pattern: "request" });
    }
  }
  for (const m of matchAll(content, UMI_REQUEST_OBJ_RE)) {
    const block = m[0];
    const methodMatch = block.match(UMI_METHOD_RE);
    const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
    const urlToken = m[1].trim().replace(/[,}].*/, "");
    calls.push({ method, url: urlToken, pattern: "request" });
  }
  for (const m of matchAll(content, INST_CALL_RE)) {
    calls.push({ method: extractMethod(m[0]), url: normalizeUrl(m[1]), pattern: "instance" });
  }
  const hasQueryHook = USE_QUERY_RE.test(content);
  USE_QUERY_RE.lastIndex = 0;
  const ctrlMatch = content.match(NEST_CTRL_RE);
  const controllerPrefix = ctrlMatch ? normalizeUrl(ctrlMatch[1] ?? "") : "";
  for (const m of matchAll(content, NEST_ROUTE_RE)) {
    const httpMethod = m[1].toUpperCase();
    const routePath = controllerPrefix ? `${controllerPrefix}/${m[2]}`.replace(/\/+/g, "/") : normalizeUrl(m[2]);
    nestjsRoutes.push({ method: httpMethod, url: routePath, pattern: "nestjs-route" });
  }
  if (calls.length === 0 && nestjsRoutes.length === 0 && !hasQueryHook) return null;
  return { calls, hasQueryHook, nestjsRoutes, controllerPrefix };
}
function analyzeHttpCalls(files) {
  const result = /* @__PURE__ */ new Map();
  for (const file of files) {
    const info = detectHttpCalls(file.path);
    if (info) result.set(file.path, info);
  }
  return result;
}
function matchAll(content, re) {
  const results = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(content)) !== null) results.push(m);
  re.lastIndex = 0;
  return results;
}
function extractMethod(raw) {
  const lower = raw.toLowerCase();
  for (const m of ["post", "put", "delete", "patch", "head"]) {
    if (lower.includes(`.${m}(`)) return m.toUpperCase();
  }
  return "GET";
}
function extractMethodFromContext(content, idx) {
  const before = content.slice(Math.max(0, idx - 100), idx);
  const m = before.match(/method\s*:\s*['"](\w+)['"]/i);
  return m ? m[1].toUpperCase() : "GET";
}
function normalizeUrl(url) {
  return "/" + url.replace(/^\/+/, "").replace(/\/+$/, "");
}

// src/analyzers/exports.ts
import fs6 from "fs";
import path4 from "path";
var EXPORT_RE = /export\s+(?:async\s+)?(?:function|class|const|let|var|enum|type|interface)\s+(\w+)/g;
var EXPORT_DEFAULT_RE = /export\s+default\s+(?:function|class)\s+(\w+)/g;
var EXPORT_BRACE_RE = /export\s+\{([^}]+)\}/g;
function extractExports(content) {
  const symbols = /* @__PURE__ */ new Set();
  let m;
  EXPORT_RE.lastIndex = 0;
  while ((m = EXPORT_RE.exec(content)) !== null) symbols.add(m[1]);
  EXPORT_DEFAULT_RE.lastIndex = 0;
  while ((m = EXPORT_DEFAULT_RE.exec(content)) !== null) symbols.add(m[1]);
  EXPORT_BRACE_RE.lastIndex = 0;
  while ((m = EXPORT_BRACE_RE.exec(content)) !== null) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/\s+as\s+\w+/, "").trim();
      if (name && !name.includes(" ")) symbols.add(name);
    }
  }
  return Array.from(symbols);
}
function analyzeUnusedExports(files) {
  const contents = /* @__PURE__ */ new Map();
  for (const file of files) {
    try {
      contents.set(file.path, fs6.readFileSync(file.path, "utf-8"));
    } catch {
    }
  }
  const allContent = Array.from(contents.values()).join("\n");
  const result = /* @__PURE__ */ new Map();
  for (const file of files) {
    const content = contents.get(file.path);
    if (!content) continue;
    const exports = extractExports(content);
    if (exports.length === 0) continue;
    const unused = [];
    const otherContent = allContent.replace(content, "");
    for (const sym of exports) {
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
function unusedExportsToRelative(map, root) {
  const result = {};
  for (const [abs, syms] of map) {
    result[path4.relative(root, abs)] = syms;
  }
  return result;
}

// src/analyzers/git.ts
import { execSync } from "child_process";
import path5 from "path";
function getGitChurn(root, filePath) {
  try {
    const rel = path5.relative(root, filePath);
    const out = execSync(`git -C "${root}" log --oneline -- "${rel}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5e3
    });
    return out.trim().split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}
function isGitRepo(root) {
  try {
    execSync(`git -C "${root}" rev-parse --git-dir`, { stdio: "pipe", timeout: 3e3 });
    return true;
  } catch {
    return false;
  }
}
function analyzeGitRisk(root, files, importedByCount) {
  const result = /* @__PURE__ */ new Map();
  if (!isGitRepo(root)) return result;
  for (const file of files) {
    const churn = getGitChurn(root, file.path);
    const fanOut = importedByCount.get(file.path) ?? 0;
    const riskScore = Math.round(churn * Math.log(fanOut + 1) * 10) / 10;
    result.set(file.path, { churn, riskScore });
  }
  return result;
}

// src/analyzers/monorepo.ts
import fs7 from "fs";
import path6 from "path";
function detectMonorepo(root) {
  const packages = [];
  const pnpmWs = path6.join(root, "pnpm-workspace.yaml");
  if (fs7.existsSync(pnpmWs)) {
    const content = fs7.readFileSync(pnpmWs, "utf-8");
    const globs = extractYamlPackages(content);
    packages.push(...resolveGlobs(root, globs));
  }
  const pkgPath = path6.join(root, "package.json");
  if (fs7.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs7.readFileSync(pkgPath, "utf-8"));
      const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : Array.isArray(pkg.workspaces?.packages) ? pkg.workspaces.packages : [];
      packages.push(...resolveGlobs(root, ws));
    } catch {
    }
  }
  const lernaPath = path6.join(root, "lerna.json");
  if (fs7.existsSync(lernaPath)) {
    try {
      const lerna = JSON.parse(fs7.readFileSync(lernaPath, "utf-8"));
      const pkgs = lerna.packages ?? ["packages/*"];
      packages.push(...resolveGlobs(root, pkgs));
    } catch {
    }
  }
  return [...new Set(packages)].filter((p) => p !== root && fs7.existsSync(path6.join(p, "package.json")));
}
function isMonorepo(root) {
  return detectMonorepo(root).length > 0;
}
function getPackageName(pkgRoot) {
  try {
    const pkg = JSON.parse(fs7.readFileSync(path6.join(pkgRoot, "package.json"), "utf-8"));
    return pkg.name ?? path6.basename(pkgRoot);
  } catch {
    return path6.basename(pkgRoot);
  }
}
function extractYamlPackages(yaml) {
  const result = [];
  let inPackages = false;
  for (const line of yaml.split("\n")) {
    if (line.trim().startsWith("packages:")) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const m = line.match(/^\s+-\s+['"]?([^'"#\s]+)['"]?/);
      if (m) result.push(m[1]);
      else if (line.trim() && !line.trim().startsWith("#")) inPackages = false;
    }
  }
  return result;
}
function resolveGlobs(root, patterns) {
  const results = [];
  for (const pattern of patterns) {
    const clean = pattern.replace(/\/\*\*?$/, "");
    const base = path6.resolve(root, clean.replace(/\*$/, ""));
    if (pattern.includes("*")) {
      try {
        const entries = fs7.readdirSync(base, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) results.push(path6.join(base, e.name));
        }
      } catch {
      }
    } else {
      results.push(path6.resolve(root, pattern));
    }
  }
  return results;
}

// src/generators/claude-md.ts
import path7 from "path";
function generateClaudeMd(opts) {
  const { root, files, graph, reactInfo, nestjsInfo, frameworks } = opts;
  const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const lines = [];
  lines.push(`# Architecture Overview`);
  lines.push(`> Generated by [repo-context-mapper](https://github.com/your-org/repo-context-mapper) on ${date}`);
  lines.push(`> This file is auto-generated. Do not edit manually.`);
  lines.push(``);
  lines.push(`## Tech Stack`);
  lines.push(`- **Framework**: ${frameworks.length > 0 ? frameworks.join(", ") : "Unknown"}`);
  lines.push(`- **Total source files**: ${files.length}`);
  lines.push(`- **Root**: \`${root}\``);
  lines.push(``);
  const highImpact = files.map((f) => ({ f, count: graph.getImportedBy(f.path).length })).filter(({ count }) => count >= 3).sort((a, b) => b.count - a.count).slice(0, 10);
  if (highImpact.length > 0) {
    lines.push(`## High-Impact Files`);
    lines.push(`Files imported by many others \u2014 changes here have wide blast radius:`);
    lines.push(``);
    for (const { f, count } of highImpact) {
      const label = count >= 10 ? "\u{1F534} critical" : count >= 5 ? "\u{1F7E1} high" : "\u{1F7E2} medium";
      lines.push(`- \`${f.relativePath}\` \u2190 imported by **${count}** files (${label})`);
    }
    lines.push(``);
  }
  if (nestjsInfo && frameworks.includes("nestjs")) {
    lines.push(`## NestJS Architecture`);
    lines.push(``);
    if (nestjsInfo.modules.length > 0) {
      lines.push(`### Modules`);
      for (const mod of nestjsInfo.modules) {
        lines.push(`#### ${mod.name} (\`${mod.file}\`)`);
        if (mod.controllers.length > 0) {
          lines.push(`- **Controllers**: ${mod.controllers.join(", ")}`);
        }
        if (mod.providers.length > 0) {
          lines.push(`- **Providers**: ${mod.providers.join(", ")}`);
        }
      }
      lines.push(``);
    }
    if (nestjsInfo.controllers.length > 0) {
      lines.push(`### Controllers (${nestjsInfo.controllers.length})`);
      for (const f of nestjsInfo.controllers) lines.push(`- \`${f}\``);
      lines.push(``);
    }
    if (nestjsInfo.services.length > 0) {
      lines.push(`### Services / Providers (${nestjsInfo.services.length})`);
      for (const f of nestjsInfo.services) lines.push(`- \`${f}\``);
      lines.push(``);
    }
    if (nestjsInfo.guards.length > 0) {
      lines.push(`### Guards (${nestjsInfo.guards.length})`);
      for (const f of nestjsInfo.guards) lines.push(`- \`${f}\``);
      lines.push(``);
    }
    if (nestjsInfo.interceptors.length > 0) {
      lines.push(`### Interceptors (${nestjsInfo.interceptors.length})`);
      for (const f of nestjsInfo.interceptors) lines.push(`- \`${f}\``);
      lines.push(``);
    }
  }
  if (reactInfo && frameworks.includes("react")) {
    lines.push(`## React Architecture`);
    lines.push(``);
    const componentsByDir = groupByDir(reactInfo.components);
    lines.push(`### Components (${reactInfo.components.length} total)`);
    for (const [dir, comps] of componentsByDir) {
      lines.push(`- **${dir || "."}** \u2192 ${comps.length} component${comps.length > 1 ? "s" : ""}`);
    }
    lines.push(``);
    if (reactInfo.hooks.length > 0) {
      lines.push(`### Custom Hooks (${reactInfo.hooks.length})`);
      for (const f of reactInfo.hooks) lines.push(`- \`${f}\``);
      lines.push(``);
    }
    if (reactInfo.contexts.length > 0) {
      lines.push(`### Contexts (${reactInfo.contexts.length})`);
      for (const f of reactInfo.contexts) lines.push(`- \`${f}\``);
      lines.push(``);
    }
    if (reactInfo.hasRouter) {
      lines.push(`> Router: React Router detected`);
      lines.push(``);
    }
  }
  lines.push(`## Source Map`);
  lines.push(`Machine-readable dependency graph: \`.claude/source-map.json\``);
  lines.push(``);
  lines.push(`Run impact analysis:`);
  lines.push("```bash");
  lines.push(`npx repo-mapper impact --file <path-to-file>`);
  lines.push("```");
  return lines.join("\n");
}
function groupByDir(files) {
  const map = /* @__PURE__ */ new Map();
  for (const f of files) {
    const dir = path7.dirname(f);
    if (!map.has(dir)) map.set(dir, []);
    map.get(dir).push(f);
  }
  return map;
}

// src/generators/graph.ts
import path8 from "path";
function generateGraph(opts) {
  const { root, graph, files, frameworks, httpMap, unusedExportsMap, gitRiskMap, duplicates, packageMap } = opts;
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const filesOutput = {};
  for (const filePath of graph.getAllFiles()) {
    const rel = path8.relative(root, filePath);
    const fileInfo = fileMap.get(filePath);
    const imports = graph.getImports(filePath).map((f) => path8.relative(root, f));
    const importedBy = graph.getImportedBy(filePath).map((f) => path8.relative(root, f));
    const http = httpMap?.get(filePath);
    const git = gitRiskMap?.get(filePath);
    const loc = fileInfo?.linesOfCode ?? 0;
    const httpCallCount = http?.calls.length ?? 0;
    const complexity = Math.round(
      (imports.length * 0.3 + importedBy.length * 0.5 + httpCallCount * 0.8 + loc / 100) * 10
    ) / 10;
    filesOutput[rel] = {
      type: fileInfo?.type ?? "unknown",
      imports,
      importedBy,
      importedByCount: importedBy.length,
      linesOfCode: loc,
      complexity,
      httpCalls: http?.calls ?? [],
      nestjsRoutes: http?.nestjsRoutes ?? [],
      hasQueryHook: http?.hasQueryHook ?? false,
      unusedExports: unusedExportsMap?.[rel] ?? [],
      gitChurn: git?.churn ?? 0,
      riskScore: git?.riskScore ?? 0,
      package: packageMap?.get(filePath)
    };
  }
  const cycles = graph.detectCycles().map(
    (cycle) => cycle.map((f) => path8.relative(root, f))
  );
  return {
    generated: (/* @__PURE__ */ new Date()).toISOString(),
    root,
    framework: frameworks,
    totalFiles: files.length,
    cycles,
    duplicates: duplicates ?? [],
    files: filesOutput
  };
}

// src/analyze.ts
async function analyze(options = {}) {
  const root = path9.resolve(options.root ?? process.cwd());
  const outputDir = options.outputDir ?? path9.join(root, ".claude");
  const monorepoMode = options.monorepo ?? isMonorepo(root);
  const subPackages = monorepoMode ? detectMonorepo(root) : [];
  const packageMap = /* @__PURE__ */ new Map();
  if (monorepoMode && subPackages.length > 0) {
    for (const pkgRoot of subPackages) {
      const pkgName = getPackageName(pkgRoot);
      packageMap.set(pkgRoot, pkgName);
    }
  }
  const { graph, files } = analyzeFiles(root);
  const filePackageMap = /* @__PURE__ */ new Map();
  if (monorepoMode) {
    for (const file of files) {
      for (const [pkgRoot, pkgName] of packageMap) {
        if (file.path.startsWith(pkgRoot + path9.sep)) {
          filePackageMap.set(file.path, pkgName);
          break;
        }
      }
    }
  }
  const frameworks = options.frameworks ?? detectFrameworks(root);
  let reactInfo;
  let nestjsInfo;
  if (frameworks.includes("react")) reactInfo = analyzeReactFiles(files);
  if (frameworks.includes("nestjs")) nestjsInfo = analyzeNestJSFiles(files, root);
  const httpMap = analyzeHttpCalls(files);
  const duplicates = detectDuplicates(files);
  let unusedExportsMap = {};
  if (!options.skipUnusedExports) {
    const rawMap = analyzeUnusedExports(files);
    unusedExportsMap = unusedExportsToRelative(rawMap, root);
  }
  let gitRiskMap = /* @__PURE__ */ new Map();
  if (!options.skipGit) {
    const importedByCount = new Map(files.map((f) => [f.path, graph.getImportedBy(f.path).length]));
    gitRiskMap = analyzeGitRisk(root, files, importedByCount);
  }
  const sourceMap = generateGraph({
    root,
    graph,
    files,
    frameworks,
    httpMap,
    unusedExportsMap,
    gitRiskMap,
    duplicates,
    packageMap: filePackageMap.size > 0 ? filePackageMap : void 0
  });
  const claudeMd = generateClaudeMd({ root, files, graph, reactInfo, nestjsInfo, frameworks });
  fs8.mkdirSync(outputDir, { recursive: true });
  fs8.writeFileSync(path9.join(outputDir, "source-map.json"), JSON.stringify(sourceMap, null, 2), "utf-8");
  if (options.writeClaudeMd !== false) {
    fs8.writeFileSync(path9.join(root, "CLAUDE.md"), claudeMd, "utf-8");
  }
  return { root, frameworks, reactInfo, nestjsInfo, sourceMap, claudeMd, outputDir };
}
function detectFrameworks(root) {
  const pkgPath = path9.join(root, "package.json");
  if (!fs8.existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(fs8.readFileSync(pkgPath, "utf-8"));
    const deps = { ...pkg.dependencies ?? {}, ...pkg.devDependencies ?? {} };
    const frameworks = [];
    if ("react" in deps) frameworks.push("react");
    if ("@nestjs/core" in deps || "@nestjs/common" in deps) frameworks.push("nestjs");
    return frameworks;
  } catch {
    return [];
  }
}
function detectDuplicates(files) {
  const byName = /* @__PURE__ */ new Map();
  for (const file of files) {
    const name = path9.basename(file.path, path9.extname(file.path));
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(file.relativePath);
  }
  return Array.from(byName.entries()).filter(([, paths]) => paths.length > 1).map(([name, files2]) => ({ name, files: files2 })).sort((a, b) => b.files.length - a.files.length);
}

// src/generators/impact-report.ts
import path10 from "path";
function calculateImpact(changedFile, root, graph) {
  const abs = path10.isAbsolute(changedFile) ? changedFile : path10.resolve(root, changedFile);
  const impacted = graph.getImpacted(abs);
  const criticalFiles = impacted.filter(({ file }) => graph.getImportedBy(file).length >= 3).map(({ file }) => path10.relative(root, file));
  return {
    changedFile: path10.relative(root, abs),
    impacted: impacted.map(({ file, depth }) => ({
      file: path10.relative(root, file),
      depth
    })),
    totalImpacted: impacted.length,
    criticalFiles
  };
}
function renderImpactMarkdown(result) {
  const lines = [
    `# Impact Report: \`${result.changedFile}\``,
    ``,
    `**Total files impacted:** ${result.totalImpacted}`,
    ``
  ];
  if (result.totalImpacted === 0) {
    lines.push(`No other files import this file directly or transitively.`);
    return lines.join("\n");
  }
  if (result.criticalFiles.length > 0) {
    lines.push(`## Critical (high fan-out files affected)`);
    for (const f of result.criticalFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push("");
  }
  const byDepth = /* @__PURE__ */ new Map();
  for (const { file, depth } of result.impacted) {
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth).push(file);
  }
  lines.push(`## Impacted Files by Depth`);
  for (const [depth, files] of [...byDepth.entries()].sort(([a], [b]) => a - b)) {
    lines.push(`### Depth ${depth} (${files.length} files)`);
    for (const f of files) {
      lines.push(`- \`${f}\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// src/generators/health-report.ts
function generateHealthReport(sourceMap, apiMatch) {
  const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const entries = Object.entries(sourceMap.files);
  const lines = [];
  const aloneFiles = entries.filter(([, f]) => f.importedByCount === 0 && !(f.imports.length === 0 && f.type === "unknown"));
  const highRiskFiles = entries.filter(([, f]) => f.riskScore > 0).sort((a, b) => b[1].riskScore - a[1].riskScore);
  const filesWithUnused = entries.filter(([, f]) => f.unusedExports.length > 0);
  const complexityScores = entries.map(([, f]) => f.complexity);
  const avgComplexity = complexityScores.length ? Math.round(complexityScores.reduce((a, b) => a + b, 0) / complexityScores.length * 10) / 10 : 0;
  const highComplexity = entries.filter(([, f]) => f.complexity > 10);
  lines.push(`# Architecture Health Report`);
  lines.push(`> Generated by repo-context-mapper on ${date}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total files | ${sourceMap.totalFiles} |`);
  lines.push(`| Circular dependencies | ${sourceMap.cycles.length === 0 ? "\u2705 None" : `\u{1F534} ${sourceMap.cycles.length}`} |`);
  lines.push(`| Unused components (alone) | ${aloneFiles.length === 0 ? "\u2705 None" : `\u26A0\uFE0F ${aloneFiles.length}`} |`);
  lines.push(`| Duplicate file names | ${sourceMap.duplicates.length === 0 ? "\u2705 None" : `\u{1F501} ${sourceMap.duplicates.length} groups`} |`);
  lines.push(`| Files with unused exports | ${filesWithUnused.length} |`);
  lines.push(`| Avg complexity score | ${avgComplexity} |`);
  lines.push(`| High complexity files (>10) | ${highComplexity.length} |`);
  if (apiMatch) {
    lines.push(`| API matched routes | \u2705 ${apiMatch.matched} |`);
    lines.push(`| Unmatched frontend calls | ${apiMatch.unmatchedFrontend.length === 0 ? "\u2705 0" : `\u274C ${apiMatch.unmatchedFrontend.length}`} |`);
    lines.push(`| Dead backend routes | ${apiMatch.unmatchedBackend.length === 0 ? "\u2705 0" : `\u{1F507} ${apiMatch.unmatchedBackend.length}`} |`);
  }
  lines.push(``);
  lines.push(`## \u{1F534} Circular Dependencies`);
  lines.push(``);
  if (sourceMap.cycles.length === 0) {
    lines.push(`No circular dependencies found. \u2705`);
  } else {
    lines.push(`Found **${sourceMap.cycles.length}** circular import cycle(s):`);
    lines.push(``);
    sourceMap.cycles.slice(0, 20).forEach((cycle, i) => {
      lines.push(`**Cycle ${i + 1}:** ${cycle.map((f) => `\`${f}\``).join(" \u2192 ")}`);
    });
    if (sourceMap.cycles.length > 20) lines.push(`_...and ${sourceMap.cycles.length - 20} more_`);
  }
  lines.push(``);
  lines.push(`## \u26A0\uFE0F Unused Components (Alone)`);
  lines.push(``);
  if (aloneFiles.length === 0) {
    lines.push(`All components are used. \u2705`);
  } else {
    lines.push(`${aloneFiles.length} file(s) are defined but never imported:`);
    lines.push(``);
    const byType = /* @__PURE__ */ new Map();
    for (const [file, f] of aloneFiles) {
      const t = f.type;
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(file);
    }
    for (const [type, files] of byType) {
      lines.push(`**${type}** (${files.length})`);
      files.slice(0, 10).forEach((f) => lines.push(`- \`${f}\``));
      if (files.length > 10) lines.push(`  _...and ${files.length - 10} more_`);
      lines.push(``);
    }
  }
  lines.push(`## \u{1F501} Duplicate File Names`);
  lines.push(``);
  if (sourceMap.duplicates.length === 0) {
    lines.push(`No duplicate file names found. \u2705`);
  } else {
    lines.push(`${sourceMap.duplicates.length} group(s) of files share the same name:`);
    lines.push(``);
    sourceMap.duplicates.slice(0, 20).forEach(({ name, files }) => {
      lines.push(`**\`${name}\`** \u2014 ${files.length} files`);
      files.forEach((f) => lines.push(`- \`${f}\``));
      lines.push(``);
    });
  }
  lines.push(`## \u{1F525} High-Risk Files (Git Churn \xD7 Fan-out)`);
  lines.push(``);
  if (highRiskFiles.length === 0) {
    lines.push(`No git data available (run inside a git repo).`);
  } else {
    lines.push(`Top 10 files most likely to cause regressions when changed:`);
    lines.push(``);
    lines.push(`| File | Risk Score | Churn | Imported By |`);
    lines.push(`|------|-----------|-------|-------------|`);
    highRiskFiles.slice(0, 10).forEach(([file, f]) => {
      lines.push(`| \`${file}\` | ${f.riskScore} | ${f.gitChurn} commits | ${f.importedByCount} files |`);
    });
  }
  lines.push(``);
  lines.push(`## \u{1F4CA} Complexity Distribution`);
  lines.push(``);
  const low = entries.filter(([, f]) => f.complexity <= 3).length;
  const med = entries.filter(([, f]) => f.complexity > 3 && f.complexity <= 10).length;
  const high = entries.filter(([, f]) => f.complexity > 10).length;
  lines.push(`| Level | Range | Count |`);
  lines.push(`|-------|-------|-------|`);
  lines.push(`| Low | \u2264 3 | ${low} files |`);
  lines.push(`| Medium | 3\u201310 | ${med} files |`);
  lines.push(`| High | > 10 | ${high} files |`);
  lines.push(``);
  if (highComplexity.length > 0) {
    lines.push(`Top complex files:`);
    highComplexity.sort((a, b) => b[1].complexity - a[1].complexity).slice(0, 10).forEach(([file, f]) => lines.push(`- \`${file}\` \u2014 score: ${f.complexity} (${f.linesOfCode} loc, ${f.importedByCount} importers)`));
    lines.push(``);
  }
  if (filesWithUnused.length > 0) {
    lines.push(`## \u{1F5D1}\uFE0F Unused Exports`);
    lines.push(``);
    lines.push(`${filesWithUnused.length} file(s) have exports that appear unused:`);
    lines.push(``);
    filesWithUnused.slice(0, 15).forEach(([file, f]) => {
      lines.push(`- \`${file}\`: ${f.unusedExports.map((e) => `\`${e}\``).join(", ")}`);
    });
    if (filesWithUnused.length > 15) lines.push(`_...and ${filesWithUnused.length - 15} more_`);
    lines.push(``);
  }
  if (apiMatch) {
    lines.push(`## \u{1F517} API Contract`);
    lines.push(``);
    lines.push(`- \u2705 Matched routes: **${apiMatch.matched}**`);
    lines.push(``);
    if (apiMatch.unmatchedFrontend.length > 0) {
      lines.push(`### \u274C Frontend calls with no backend route (potential 404)`);
      apiMatch.unmatchedFrontend.forEach((c) => lines.push(`- \`${c.method} ${c.url}\` \u2014 \`${c.file}\``));
      lines.push(``);
    }
    if (apiMatch.unmatchedBackend.length > 0) {
      lines.push(`### \u{1F507} Backend routes with no frontend caller (dead endpoints)`);
      apiMatch.unmatchedBackend.forEach((r) => lines.push(`- \`${r.method} ${r.url}\` \u2014 \`${r.file}\``));
      lines.push(``);
    }
  }
  return lines.join("\n");
}

// src/generators/html-graph.ts
function generateHtmlGraph(sourceMap, opts = {}) {
  const { minImporters = 0, title = "Dependency Graph" } = opts;
  const graphData = JSON.stringify(sourceMap.files);
  const cycleEdgeSet = /* @__PURE__ */ new Set();
  const cycleNodeSet = /* @__PURE__ */ new Set();
  for (const cycle of sourceMap.cycles) {
    for (let i = 0; i < cycle.length - 1; i++) {
      cycleEdgeSet.add(`${cycle[i]}||${cycle[i + 1]}`);
      cycleNodeSet.add(cycle[i]);
    }
  }
  const duplicateNodeSet = /* @__PURE__ */ new Set();
  for (const dup of sourceMap.duplicates) {
    for (const f of dup.files) duplicateNodeSet.add(f);
  }
  const meta = JSON.stringify({
    generated: sourceMap.generated,
    root: sourceMap.root,
    framework: sourceMap.framework,
    totalFiles: sourceMap.totalFiles,
    cycleCount: sourceMap.cycles.length,
    duplicateCount: sourceMap.duplicates.length
  });
  const CYCLE_EDGES = JSON.stringify([...cycleEdgeSet]);
  const CYCLE_NODES = JSON.stringify([...cycleNodeSet]);
  const DUPLICATE_NODES = JSON.stringify([...duplicateNodeSet]);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${title}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<style>
/* \u2500\u2500 reset & base \u2500\u2500 */
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f2f2f7;
  --surface:rgba(255,255,255,0.85);
  --surface-solid:#ffffff;
  --border:rgba(0,0,0,0.08);
  --border-strong:rgba(0,0,0,0.14);
  --text:#1d1d1f;
  --text-2:#6e6e73;
  --text-3:#aeaeb2;
  --accent:#0071e3;
  --accent-bg:rgba(0,113,227,0.1);
  --red:#ff3b30;
  --orange:#ff9f0a;
  --yellow:#ffd60a;
  --green:#30d158;
  --teal:#32ade6;
  --purple:#bf5af2;
  --indigo:#5e5ce6;
  --radius:12px;
  --radius-sm:8px;
  --radius-xs:6px;
  --shadow-sm:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
  --shadow:0 4px 16px rgba(0,0,0,.08),0 1px 4px rgba(0,0,0,.04);
  --shadow-lg:0 12px 40px rgba(0,0,0,.12),0 4px 12px rgba(0,0,0,.06);
  --blur:saturate(180%) blur(20px);
}
body{
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;
  background:var(--bg);
  color:var(--text);
  height:100vh;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  -webkit-font-smoothing:antialiased;
}

/* \u2500\u2500 toolbar \u2500\u2500 */
#toolbar{
  height:52px;
  background:var(--surface);
  backdrop-filter:var(--blur);
  -webkit-backdrop-filter:var(--blur);
  border-bottom:1px solid var(--border);
  display:flex;
  align-items:center;
  gap:10px;
  padding:0 16px;
  flex-shrink:0;
  position:relative;
  z-index:10;
}
#app-icon{
  width:28px;height:28px;
  background:linear-gradient(135deg,var(--indigo),var(--purple));
  border-radius:7px;
  display:flex;align-items:center;justify-content:center;
  font-size:15px;
  flex-shrink:0;
  box-shadow:0 2px 8px rgba(94,92,230,.35);
}
#app-title{
  font-size:13px;
  font-weight:600;
  color:var(--text);
  letter-spacing:-.01em;
  white-space:nowrap;
}
#search-wrap{
  position:relative;
  flex:1;
  max-width:280px;
  margin-left:4px;
}
#search-wrap svg{
  position:absolute;
  left:9px;top:50%;transform:translateY(-50%);
  opacity:.4;
  pointer-events:none;
}
#search{
  width:100%;
  padding:6px 10px 6px 30px;
  background:rgba(0,0,0,0.06);
  border:1px solid transparent;
  border-radius:20px;
  color:var(--text);
  font-size:13px;
  outline:none;
  transition:all .2s;
  font-family:inherit;
}
#search:focus{
  background:#fff;
  border-color:var(--accent);
  box-shadow:0 0 0 3px rgba(0,113,227,.15);
}
#search::placeholder{color:var(--text-3)}

.divider{width:1px;height:22px;background:var(--border-strong);flex-shrink:0;margin:0 2px}

/* \u2500\u2500 pill group \u2500\u2500 */
.pill-group{
  display:flex;
  background:rgba(0,0,0,0.06);
  border-radius:20px;
  padding:2px;
  gap:1px;
  flex-shrink:0;
}
.pill-btn{
  padding:4px 12px;
  border-radius:16px;
  border:none;
  background:transparent;
  color:var(--text-2);
  font-size:12px;
  font-weight:500;
  cursor:pointer;
  transition:all .15s;
  white-space:nowrap;
  font-family:inherit;
}
.pill-btn:hover{color:var(--text);background:rgba(0,0,0,.05)}
.pill-btn.active{
  background:var(--surface-solid);
  color:var(--text);
  box-shadow:var(--shadow-sm);
}

/* \u2500\u2500 filter chips \u2500\u2500 */
#filter-bar{
  height:40px;
  background:var(--surface);
  backdrop-filter:var(--blur);
  -webkit-backdrop-filter:var(--blur);
  border-bottom:1px solid var(--border);
  display:flex;
  align-items:center;
  gap:6px;
  padding:0 16px;
  flex-shrink:0;
  overflow-x:auto;
}
#filter-bar::-webkit-scrollbar{display:none}
.filter-label{font-size:11px;color:var(--text-3);white-space:nowrap;margin-right:2px;font-weight:500;letter-spacing:.02em;text-transform:uppercase}
.chip{
  padding:3px 10px;
  border-radius:20px;
  border:1px solid var(--border-strong);
  background:transparent;
  color:var(--text-2);
  font-size:12px;
  font-weight:500;
  cursor:pointer;
  white-space:nowrap;
  transition:all .15s;
  font-family:inherit;
  flex-shrink:0;
}
.chip:hover{background:rgba(0,0,0,.05);color:var(--text)}
.chip.active{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 2px 8px rgba(0,113,227,.3)}
.chip.warn{border-color:rgba(255,159,10,.4);color:var(--orange)}
.chip.warn.active{background:var(--orange);border-color:var(--orange);color:#fff;box-shadow:0 2px 8px rgba(255,159,10,.35)}
.chip.danger{border-color:rgba(255,59,48,.35);color:var(--red)}
.chip.danger.active{background:var(--red);border-color:var(--red);color:#fff;box-shadow:0 2px 8px rgba(255,59,48,.35)}
.chip.dup{border-color:rgba(255,159,10,.4);color:var(--orange)}
.chip.dup.active{background:var(--orange);border-color:var(--orange);color:#fff}

/* \u2500\u2500 controls row \u2500\u2500 */
#controls-row{
  display:flex;
  align-items:center;
  gap:8px;
  margin-left:auto;
  flex-shrink:0;
}
.ctrl-label{font-size:12px;color:var(--text-2);white-space:nowrap}
.num-input{
  width:44px;
  padding:4px 6px;
  background:rgba(0,0,0,.06);
  border:1px solid transparent;
  border-radius:var(--radius-xs);
  color:var(--text);
  font-size:12px;
  outline:none;
  text-align:center;
  font-family:inherit;
  transition:all .15s;
}
.num-input:focus{background:#fff;border-color:var(--accent)}
.toggle-label{
  display:flex;align-items:center;gap:5px;
  font-size:12px;color:var(--text-2);cursor:pointer;
}
#stat-badge{
  font-size:11px;
  color:var(--text-3);
  background:rgba(0,0,0,.05);
  padding:3px 8px;
  border-radius:10px;
  white-space:nowrap;
}

/* \u2500\u2500 main layout \u2500\u2500 */
#main{display:flex;flex:1;overflow:hidden;position:relative}
#canvas{flex:1;position:relative;overflow:hidden;background:var(--bg)}
svg{width:100%;height:100%}

/* \u2500\u2500 grid bg \u2500\u2500 */
#canvas::before{
  content:'';
  position:absolute;inset:0;
  background-image:radial-gradient(circle,rgba(0,0,0,.08) 1px,transparent 1px);
  background-size:24px 24px;
  pointer-events:none;
}

/* \u2500\u2500 sidebar \u2500\u2500 */
#sidebar{
  width:300px;
  background:var(--surface-solid);
  border-left:1px solid var(--border);
  display:flex;
  flex-direction:column;
  flex-shrink:0;
  overflow:hidden;
}
#sidebar-header{
  padding:14px 16px 10px;
  border-bottom:1px solid var(--border);
  flex-shrink:0;
}
#sidebar-header h2{
  font-size:13px;
  font-weight:600;
  color:var(--text);
  letter-spacing:-.01em;
}
#sidebar-body{
  flex:1;
  overflow-y:auto;
  padding:12px 16px 16px;
  display:flex;
  flex-direction:column;
  gap:14px;
}
#sidebar-body::-webkit-scrollbar{width:4px}
#sidebar-body::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:2px}
#detail-empty{
  color:var(--text-3);
  font-size:13px;
  text-align:center;
  padding:24px 0;
  line-height:1.6;
}
#detail-empty .empty-icon{font-size:32px;display:block;margin-bottom:8px;opacity:.5}

.section{display:flex;flex-direction:column;gap:6px}
.section-title{
  font-size:10px;
  font-weight:600;
  color:var(--text-3);
  text-transform:uppercase;
  letter-spacing:.08em;
}
.section-value{font-size:13px;color:var(--text);word-break:break-all;line-height:1.4}
.type-badge{
  display:inline-flex;
  align-items:center;
  gap:5px;
  padding:3px 9px;
  border-radius:20px;
  font-size:12px;
  font-weight:500;
  width:fit-content;
}
.metrics-grid{
  display:grid;
  grid-template-columns:1fr 1fr 1fr;
  gap:6px;
}
.metric-card{
  background:var(--bg);
  border-radius:var(--radius-sm);
  padding:8px;
  text-align:center;
}
.metric-val{font-size:17px;font-weight:600;color:var(--text);line-height:1.2}
.metric-key{font-size:10px;color:var(--text-3);margin-top:2px}
.flags{display:flex;flex-direction:column;gap:4px}
.flag-item{
  display:flex;align-items:center;gap:6px;
  font-size:12px;padding:5px 8px;
  border-radius:var(--radius-xs);
  background:var(--bg);
}

.file-list{
  display:flex;flex-direction:column;gap:2px;
  max-height:130px;overflow-y:auto;
}
.file-list::-webkit-scrollbar{width:3px}
.file-list::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:2px}
.file-item{
  font-size:11px;
  color:var(--text-2);
  padding:3px 7px;
  border-radius:var(--radius-xs);
  cursor:pointer;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  transition:all .1s;
  font-family:'SF Mono',Menlo,monospace;
}
.file-item:hover{background:var(--accent-bg);color:var(--accent)}

.http-list{display:flex;flex-direction:column;gap:3px;max-height:130px;overflow-y:auto}
.http-row{display:flex;align-items:center;gap:6px;padding:2px 0}
.method-pill{
  font-size:9px;font-weight:700;
  padding:2px 6px;border-radius:4px;
  flex-shrink:0;font-family:'SF Mono',Menlo,monospace;
}
.GET{background:#e8f9f0;color:#1a7f4b}
.POST{background:#eef2ff;color:#3730a3}
.PUT{background:#fff8e6;color:#92400e}
.DELETE{background:#fef2f2;color:#991b1b}
.PATCH{background:#f5f0ff;color:#6d28d9}
.QUERY{background:#f0fdf4;color:#166534}
.http-url{font-size:11px;color:var(--text-2);font-family:'SF Mono',Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* \u2500\u2500 legend \u2500\u2500 */
#sidebar-footer{
  border-top:1px solid var(--border);
  padding:12px 16px;
  flex-shrink:0;
}
.legend{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.legend-item{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-2)}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.hint{
  margin-top:8px;
  font-size:10px;color:var(--text-3);
  line-height:1.6;
  padding:8px;
  background:var(--bg);
  border-radius:var(--radius-xs);
}

/* \u2500\u2500 svg elements \u2500\u2500 */
.hull{stroke-width:1.5;stroke-dasharray:5,3}
.link{stroke-opacity:.45;stroke-width:1;fill:none}
.link.dep{stroke:#c7c7cc;marker-end:url(#arr-dep)}
.link.http{stroke:#30d158;stroke-width:1.5;stroke-dasharray:5,3;stroke-opacity:.7;marker-end:url(#arr-http)}
.link.cycle-edge{stroke:#ff3b30!important;stroke-opacity:.9!important;stroke-width:2!important}
.link.highlighted{stroke-opacity:1!important;stroke-width:2!important}
.node circle{stroke-width:1.5;cursor:pointer;transition:filter .15s}
.node:hover circle{filter:brightness(1.1)}
.node.selected circle{stroke-width:3;stroke:#fff;filter:drop-shadow(0 2px 6px rgba(0,0,0,.2))}
.node.dimmed circle{opacity:.15}
.node.dimmed text{opacity:.1}
.node text{
  font-size:9px;
  fill:var(--text-2);
  pointer-events:none;
  paint-order:stroke;
  stroke:#f2f2f7;
  stroke-width:3px;
  font-family:-apple-system,sans-serif;
}
.node.selected text,.node.hi text{fill:var(--text);font-size:10px;font-weight:500}
.cluster-label{
  font-size:12px;font-weight:600;
  fill:var(--text-3);
  pointer-events:none;
  font-family:-apple-system,sans-serif;
}
</style>
</head>
<body>

<!-- \u2500\u2500 Toolbar \u2500\u2500 -->
<div id="toolbar">
  <div id="app-icon">\u2B21</div>
  <span id="app-title">${title}</span>

  <div id="search-wrap">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
    <input id="search" type="text" placeholder="Search files\u2026" autocomplete="off" spellcheck="false"/>
  </div>

  <div class="divider"></div>

  <div class="pill-group" id="mode-group">
    <button class="pill-btn active" data-mode="force">Force</button>
    <button class="pill-btn" data-mode="cluster">Cluster</button>
    <button class="pill-btn" data-mode="heatmap">Import heat</button>
    <button class="pill-btn" data-mode="complexity">Complexity</button>
    <button class="pill-btn" data-mode="risk">Risk</button>
  </div>

  <div class="divider"></div>

  <div id="controls-row">
    <span class="ctrl-label">Min imports</span>
    <input class="num-input" id="threshold" type="number" min="0" value="${minImporters}"/>
    <label class="toggle-label">
      <input id="show-http" type="checkbox" checked/> HTTP edges
    </label>
    <span id="stat-badge">\u2013</span>
  </div>
</div>

<!-- \u2500\u2500 Filter bar \u2500\u2500 -->
<div id="filter-bar">
  <span class="filter-label">Show</span>
  <button class="chip active"  data-filter="">All</button>
  <button class="chip"         data-filter="react-component">Components</button>
  <button class="chip"         data-filter="react-hook">Hooks</button>
  <button class="chip"         data-filter="react-context">Contexts</button>
  <button class="chip"         data-filter="nestjs-module">Modules</button>
  <button class="chip"         data-filter="nestjs-controller">Controllers</button>
  <button class="chip"         data-filter="nestjs-service">Services</button>
  <button class="chip"         data-filter="http-caller">HTTP Callers</button>
  <button class="chip warn"    data-filter="alone">Alone</button>
  <button class="chip danger"  data-filter="cycles">Cycles</button>
  <button class="chip dup"     data-filter="duplicates">Duplicates</button>
</div>

<!-- \u2500\u2500 Main \u2500\u2500 -->
<div id="main">
  <div id="canvas">
    <svg id="svg">
      <defs>
        <marker id="arr-dep" viewBox="0 -3 6 6" refX="20" refY="0" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,-3L6,0L0,3" fill="#c7c7cc"/>
        </marker>
        <marker id="arr-http" viewBox="0 -3 6 6" refX="20" refY="0" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,-3L6,0L0,3" fill="#30d158"/>
        </marker>
      </defs>
    </svg>
  </div>

  <div id="sidebar">
    <div id="sidebar-header">
      <h2>Inspector</h2>
    </div>
    <div id="sidebar-body">
      <div id="detail-empty">
        <span class="empty-icon">\u2B21</span>
        Click a node to<br/>inspect it
      </div>
      <div id="detail-panel" style="display:none;flex-direction:column;gap:14px">

        <div class="section">
          <span class="section-title">File</span>
          <span class="section-value" id="d-file" style="font-family:'SF Mono',Menlo,monospace;font-size:11px"></span>
        </div>

        <div class="section">
          <span class="section-title">Type</span>
          <span class="type-badge" id="d-type"></span>
        </div>

        <div class="section">
          <span class="section-title">Metrics</span>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-val" id="m-complexity">\u2013</div>
              <div class="metric-key">Complexity</div>
            </div>
            <div class="metric-card">
              <div class="metric-val" id="m-risk">\u2013</div>
              <div class="metric-key">Risk</div>
            </div>
            <div class="metric-card">
              <div class="metric-val" id="m-churn">\u2013</div>
              <div class="metric-key">Commits</div>
            </div>
          </div>
        </div>

        <div class="section" id="flags-section" style="display:none">
          <span class="section-title">Flags</span>
          <div class="flags" id="d-flags"></div>
        </div>

        <div class="section">
          <span class="section-title">Imported by (<span id="d-by-count">0</span>)</span>
          <div class="file-list" id="d-imported-by"></div>
        </div>

        <div class="section">
          <span class="section-title">Imports (<span id="d-imports-count">0</span>)</span>
          <div class="file-list" id="d-imports"></div>
        </div>

        <div class="section" id="http-section" style="display:none">
          <span class="section-title">HTTP Calls</span>
          <div class="http-list" id="d-http"></div>
        </div>

        <div class="section" id="routes-section" style="display:none">
          <span class="section-title">NestJS Routes</span>
          <div class="http-list" id="d-routes"></div>
        </div>

      </div>
    </div>

    <div id="sidebar-footer">
      <div class="legend">
        <div class="legend-item"><div class="dot" style="background:#5e5ce6"></div>Component</div>
        <div class="legend-item"><div class="dot" style="background:#32ade6"></div>Hook</div>
        <div class="legend-item"><div class="dot" style="background:#ff9f0a"></div>Context</div>
        <div class="legend-item"><div class="dot" style="background:#30d158"></div>Module</div>
        <div class="legend-item"><div class="dot" style="background:#0071e3"></div>Controller</div>
        <div class="legend-item"><div class="dot" style="background:#bf5af2"></div>Service</div>
        <div class="legend-item"><div class="dot" style="background:#ff375f"></div>HTTP Caller</div>
        <div class="legend-item"><div class="dot" style="background:#aeaeb2"></div>Other</div>
      </div>
      <div class="hint">
        Scroll to zoom \xB7 Drag to pan<br/>Click node to inspect \xB7 \u2318 click deselect
      </div>
    </div>
  </div>
</div>

<script>
// \u2500\u2500 Data \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const FILES          = ${graphData};
const META           = ${meta};
const CYCLE_EDGE_SET = new Set(${CYCLE_EDGES});
const CYCLE_NODE_SET = new Set(${CYCLE_NODES});
const DUP_NODE_SET   = new Set(${DUPLICATE_NODES});

// \u2500\u2500 Colors \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const TYPE_COLOR = {
  'react-component':   '#5e5ce6',
  'react-hook':        '#32ade6',
  'react-context':     '#ff9f0a',
  'nestjs-module':     '#30d158',
  'nestjs-controller': '#0071e3',
  'nestjs-service':    '#bf5af2',
  'nestjs-guard':      '#ff6369',
  'nestjs-interceptor':'#ff9f0a',
  'nestjs-pipe':       '#34c759',
  'unknown':           '#aeaeb2',
};

const CLUSTER_LABEL = {
  'react-component':'Components','react-hook':'Hooks',
  'react-context':'Contexts','nestjs-module':'Modules',
  'nestjs-controller':'Controllers','nestjs-service':'Services',
  'nestjs-guard':'Guards','nestjs-interceptor':'Interceptors',
  'nestjs-pipe':'Pipes','unknown':'Other',
};

// \u2500\u2500 Heatmap scales \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const maxImport  = Math.max(...Object.values(FILES).map(f=>f.importedByCount),1);
const maxComplex = Math.max(...Object.values(FILES).map(f=>f.complexity||0),1);
const maxRisk    = Math.max(...Object.values(FILES).map(f=>f.riskScore||0),1);

function heat(v, max, from='#e8f0fe', mid='#fbbc04', to='#ea4335') {
  const t = Math.min(v/max,1);
  return t<.5 ? d3.interpolate(from,mid)(t*2) : d3.interpolate(mid,to)((t-.5)*2);
}

function nodeColor(d) {
  if(mode==='heatmap')    return heat(d.importedByCount, maxImport, '#e8f0fe','#fbbc04','#ea4335');
  if(mode==='complexity') return heat(d.complexity||0,  maxComplex,'#e8fdf3','#fbbc04','#ea4335');
  if(mode==='risk')       return heat(d.riskScore||0,   maxRisk,   '#f0f9ff','#fbbc04','#ea4335');
  if(CYCLE_NODE_SET.has(d.id)) return '#ff3b30';
  if(DUP_NODE_SET.has(d.id))   return '#ff9f0a';
  return d.hasQueryHook||d.httpCalls.length>0 ? '#ff375f' : (TYPE_COLOR[d.type]||'#aeaeb2');
}
function nodeStroke(d) {
  const c = d3.color(nodeColor(d));
  return c ? c.brighter(.8).formatHex() : '#fff';
}
function nodeR(d) { return Math.max(6, Math.min(24, 6 + d.importedByCount * 1.5)); }

// \u2500\u2500 State \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let mode='force', threshold=${minImporters}, typeFilter='', search='', showHttp=true;

// \u2500\u2500 SVG setup \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const svg   = d3.select('#svg');
const W     = ()=>document.getElementById('canvas').clientWidth;
const H     = ()=>document.getElementById('canvas').clientHeight;
const zoomG = svg.append('g');
const zoomer= d3.zoom().scaleExtent([0.04,6]).on('zoom',e=>zoomG.attr('transform',e.transform));
svg.call(zoomer);
svg.on('click',()=>deselect());

let hullG,linkG,nodeG,sim;

// \u2500\u2500 Build data \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function buildData(){
  const nodes=[],dep=[],http=[];
  for(const [id,d] of Object.entries(FILES)){
    const hasHttp=d.httpCalls.length>0||d.hasQueryHook;
    if(typeFilter==='alone'){
      if(d.importedByCount>0) continue;
      if(d.imports.length===0&&d.type==='unknown') continue;
    } else if(typeFilter==='cycles'){
      if(!CYCLE_NODE_SET.has(id)) continue;
    } else if(typeFilter==='duplicates'){
      if(!DUP_NODE_SET.has(id)) continue;
    } else {
      if(d.importedByCount<threshold) continue;
      if(typeFilter==='http-caller'&&!hasHttp) continue;
      if(typeFilter&&typeFilter!=='http-caller'&&d.type!==typeFilter) continue;
    }
    if(search&&!id.toLowerCase().includes(search)) continue;
    nodes.push({
      id,type:d.type,
      importedByCount:d.importedByCount,importsCount:d.imports.length,
      complexity:d.complexity||0,riskScore:d.riskScore||0,gitChurn:d.gitChurn||0,
      httpCalls:d.httpCalls,nestjsRoutes:d.nestjsRoutes,hasQueryHook:d.hasQueryHook,
      unusedExports:d.unusedExports||[],
      inCycle:CYCLE_NODE_SET.has(id),isDup:DUP_NODE_SET.has(id),
    });
  }
  const ids=new Set(nodes.map(n=>n.id));
  for(const [id,d] of Object.entries(FILES)){
    if(!ids.has(id)) continue;
    for(const imp of d.imports){
      if(ids.has(imp)) dep.push({source:id,target:imp,kind:'dep',isCycle:CYCLE_EDGE_SET.has(\`\${id}||\${imp}\`)});
    }
    if(showHttp&&d.httpCalls.length>0){
      for(const call of d.httpCalls){
        for(const [tid,td] of Object.entries(FILES)){
          if(!ids.has(tid)||tid===id) continue;
          if(td.nestjsRoutes?.some(r=>r.url===call.url||r.method===call.method))
            http.push({source:id,target:tid,kind:'http'});
        }
      }
    }
  }
  return {nodes,dep,http};
}

// \u2500\u2500 Render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function render(){
  zoomG.selectAll('*').remove();
  if(sim) sim.stop();

  hullG=zoomG.append('g');
  linkG=zoomG.append('g');
  nodeG=zoomG.append('g');

  const {nodes,dep,http}=buildData();
  const all=[...dep,...http];

  document.getElementById('stat-badge').textContent=
    \`\${nodes.length} / \${META.totalFiles} files\`;

  // cluster layout
  const types=[...new Set(nodes.map(n=>n.type))];
  const cx=W()/2,cy=H()/2;
  const cc={};
  types.forEach((t,i)=>{
    const a=(2*Math.PI*i/types.length)-Math.PI/2;
    const r=Math.min(cx,cy)*.5;
    cc[t]={x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};
  });

  // links
  const lSel=linkG.selectAll('line').data(all).join('line')
    .attr('class',d=>\`link \${d.kind}\${d.isCycle?' cycle-edge':''}\`);

  // nodes
  const nSel=nodeG.selectAll('g').data(nodes,d=>d.id).join('g')
    .attr('class','node')
    .call(d3.drag()
      .on('start',(e,d)=>{if(!e.active)sim.alphaTarget(.3).restart();d.fx=d.x;d.fy=d.y})
      .on('drag', (e,d)=>{d.fx=e.x;d.fy=e.y})
      .on('end',  (e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null})
    )
    .on('click',(e,d)=>{e.stopPropagation();selectNode(d,nodes,all,lSel,nSel)});

  nSel.append('circle')
    .attr('r',nodeR)
    .attr('fill',d=>nodeColor(d))
    .attr('stroke',d=>nodeStroke(d));

  nSel.append('text')
    .attr('dy',d=>nodeR(d)+10)
    .attr('text-anchor','middle')
    .text(d=>d.id.split('/').pop());

  function updateHulls(){
    hullG.selectAll('*').remove();
    if(mode!=='cluster') return;
    const byType=d3.group(nodes,n=>n.type);
    for(const [t,grp] of byType){
      if(grp.length<2) continue;
      const pts=grp.map(n=>[n.x??0,n.y??0]);
      const hull=d3.polygonHull(pts); if(!hull) continue;
      const pad=32;
      const pcx=d3.mean(pts,p=>p[0]),pcy=d3.mean(pts,p=>p[1]);
      const padded=hull.map(([px,py])=>{
        const dx=px-pcx,dy=py-pcy,dist=Math.sqrt(dx*dx+dy*dy)||1;
        return [px+dx/dist*pad,py+dy/dist*pad];
      });
      const col=TYPE_COLOR[t]||'#aeaeb2';
      hullG.append('path').datum(padded)
        .attr('class','hull')
        .attr('fill',col+'18')
        .attr('stroke',col+'55')
        .attr('d',d=>'M'+d.join('L')+'Z');
      hullG.append('text').attr('class','cluster-label')
        .attr('x',d3.mean(pts,p=>p[0]))
        .attr('y',d3.min(pts,p=>p[1])-pad-4)
        .attr('text-anchor','middle')
        .attr('fill',col+'99')
        .text(CLUSTER_LABEL[t]||t||'Other');
    }
  }

  sim=d3.forceSimulation(nodes)
    .force('link',d3.forceLink(all).id(d=>d.id).distance(mode==='cluster'?110:80))
    .force('charge',d3.forceManyBody().strength(mode==='cluster'?-220:-110))
    .force('collision',d3.forceCollide().radius(d=>nodeR(d)+6))
    .force('center',d3.forceCenter(cx,cy));

  if(mode==='cluster'){
    sim.force('cx',d3.forceX(d=>cc[d.type]?.x??cx).strength(.22));
    sim.force('cy',d3.forceY(d=>cc[d.type]?.y??cy).strength(.22));
  }

  sim.on('tick',()=>{
    lSel.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y)
        .attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
    nSel.attr('transform',d=>\`translate(\${d.x},\${d.y})\`);
    updateHulls();
  });
}

// \u2500\u2500 Select \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function selectNode(d,nodes,links,lSel,nSel){
  const conn=new Set([d.id]);
  links.forEach(l=>{
    const s=l.source.id??l.source,t=l.target.id??l.target;
    if(s===d.id)conn.add(t);if(t===d.id)conn.add(s);
  });
  nSel.classed('selected',n=>n.id===d.id);
  nSel.classed('dimmed',n=>!conn.has(n.id));
  nSel.classed('hi',n=>conn.has(n.id)&&n.id!==d.id);
  lSel.classed('highlighted',l=>(l.source.id??l.source)===d.id||(l.target.id??l.target)===d.id);

  const raw=FILES[d.id];
  document.getElementById('detail-empty').style.display='none';
  const panel=document.getElementById('detail-panel');
  panel.style.display='flex';

  // file
  document.getElementById('d-file').textContent=d.id;

  // type badge
  const badge=document.getElementById('d-type');
  const col=TYPE_COLOR[d.type]||'#aeaeb2';
  badge.textContent=d.type.replace('react-','').replace('nestjs-','');
  badge.style.cssText=\`background:\${col}18;color:\${col};border:1px solid \${col}44\`;

  // metrics
  document.getElementById('m-complexity').textContent=d.complexity??'\u2013';
  document.getElementById('m-risk').textContent=d.riskScore>0?d.riskScore:'\u2013';
  document.getElementById('m-churn').textContent=d.gitChurn>0?d.gitChurn:'\u2013';

  // flags
  const flagsEl=document.getElementById('d-flags');
  const flagsSec=document.getElementById('flags-section');
  flagsEl.innerHTML='';
  const flags=[];
  if(d.inCycle)    flags.push({icon:'\u{1F534}',label:'Part of circular dependency',bg:'#fff1f0',color:'#ff3b30'});
  if(d.isDup)      flags.push({icon:'\u{1F501}',label:'Duplicate filename',bg:'#fff8ed',color:'#ff9f0a'});
  if(d.unusedExports?.length) flags.push({icon:'\u{1F5D1}',label:\`\${d.unusedExports.length} unused export(s)\`,bg:'#f5f5f7',color:'#6e6e73'});
  if(d.hasQueryHook||d.httpCalls.length>0) flags.push({icon:'\u{1F310}',label:'Makes HTTP calls',bg:'#f0fdf4',color:'#30d158'});
  if(d.importedByCount===0&&d.type!=='unknown') flags.push({icon:'\u26A0\uFE0F',label:'Not imported anywhere',bg:'#fff8ed',color:'#ff9f0a'});
  flags.forEach(f=>{
    const div=document.createElement('div');
    div.className='flag-item';
    div.style.cssText=\`background:\${f.bg};color:\${f.color}\`;
    div.innerHTML=\`<span>\${f.icon}</span><span style="font-size:11px">\${f.label}</span>\`;
    flagsEl.appendChild(div);
  });
  flagsSec.style.display=flags.length?'':'none';

  // imports
  document.getElementById('d-by-count').textContent=d.importedByCount;
  document.getElementById('d-imports-count').textContent=d.importsCount;
  const importedBy=links.filter(l=>(l.target.id??l.target)===d.id&&l.kind==='dep').map(l=>l.source.id??l.source);
  const imports   =links.filter(l=>(l.source.id??l.source)===d.id&&l.kind==='dep').map(l=>l.target.id??l.target);
  renderFileList('d-imported-by',importedBy,nodes,links,lSel,nSel);
  renderFileList('d-imports',    imports,   nodes,links,lSel,nSel);

  // HTTP calls
  const httpSec=document.getElementById('http-section');
  const httpEl =document.getElementById('d-http');
  const calls=raw?.httpCalls||[];
  if(calls.length>0||raw?.hasQueryHook){
    httpSec.style.display='';
    httpEl.innerHTML='';
    if(raw?.hasQueryHook){
      const r=document.createElement('div');r.className='http-row';
      r.innerHTML='<span class="method-pill QUERY">QUERY</span><span class="http-url">useQuery / useMutation</span>';
      httpEl.appendChild(r);
    }
    calls.forEach(c=>{
      const r=document.createElement('div');r.className='http-row';
      r.innerHTML=\`<span class="method-pill \${c.method}">\${c.method}</span><span class="http-url" title="\${c.url}">\${c.url}</span>\`;
      httpEl.appendChild(r);
    });
  } else httpSec.style.display='none';

  // NestJS routes
  const routeSec=document.getElementById('routes-section');
  const routeEl =document.getElementById('d-routes');
  const routes=raw?.nestjsRoutes||[];
  if(routes.length>0){
    routeSec.style.display='';
    routeEl.innerHTML='';
    routes.forEach(r=>{
      const el=document.createElement('div');el.className='http-row';
      el.innerHTML=\`<span class="method-pill \${r.method}">\${r.method}</span><span class="http-url">\${r.url}</span>\`;
      routeEl.appendChild(el);
    });
  } else routeSec.style.display='none';
}

function renderFileList(id,files,nodes,links,lSel,nSel){
  const el=document.getElementById(id);
  el.innerHTML='';
  if(!files.length){el.innerHTML='<span style="color:var(--text-3);font-size:11px;padding:2px 7px">none</span>';return;}
  files.forEach(f=>{
    const div=document.createElement('div');
    div.className='file-item';div.title=f;
    div.textContent=f.split('/').slice(-2).join('/');
    div.onclick=()=>{const n=nodes.find(n=>n.id===f);if(n)selectNode(n,nodes,links,lSel,nSel)};
    el.appendChild(div);
  });
}

function deselect(){
  if(nodeG) nodeG.selectAll('.node').classed('selected dimmed hi',false);
  if(linkG) linkG.selectAll('.link').classed('highlighted',false);
  document.getElementById('detail-empty').style.display='block';
  document.getElementById('detail-panel').style.display='none';
}

// \u2500\u2500 Badge counts \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const aloneCount=Object.entries(FILES).filter(([,d])=>
  d.importedByCount===0&&!(d.imports.length===0&&d.type==='unknown')).length;
document.querySelector('[data-filter="alone"]').textContent=\`Alone (\${aloneCount})\`;
document.querySelector('[data-filter="cycles"]').textContent=\`Cycles (\${META.cycleCount})\`;
document.querySelector('[data-filter="duplicates"]').textContent=\`Duplicates (\${META.duplicateCount})\`;

// \u2500\u2500 Controls \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
document.querySelectorAll('.pill-btn').forEach(b=>b.addEventListener('click',()=>{
  mode=b.dataset.mode;
  document.querySelectorAll('.pill-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  render();
}));
document.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>{
  typeFilter=b.dataset.filter;
  document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  document.getElementById('threshold').disabled=typeFilter==='alone'||typeFilter==='cycles'||typeFilter==='duplicates';
  render();
}));
document.getElementById('search').addEventListener('input',e=>{search=e.target.value.trim().toLowerCase();render()});
document.getElementById('threshold').addEventListener('change',e=>{threshold=parseInt(e.target.value)||0;render()});
document.getElementById('show-http').addEventListener('change',e=>{showHttp=e.target.checked;render()});
window.addEventListener('resize',()=>{if(sim)sim.force('center',d3.forceCenter(W()/2,H()/2)).alpha(.1).restart()});

render();
</script>
</body>
</html>`;
}
export {
  DepGraph,
  analyze,
  analyzeFiles,
  analyzeGitRisk,
  analyzeHttpCalls,
  analyzeNestJSFiles,
  analyzeReactFiles,
  analyzeUnusedExports,
  calculateImpact,
  detectHttpCalls,
  detectMonorepo,
  extractImports,
  generateClaudeMd,
  generateGraph,
  generateHealthReport,
  generateHtmlGraph,
  getPackageName,
  isMonorepo,
  renderImpactMarkdown,
  resolveImport,
  walkFiles
};
//# sourceMappingURL=index.mjs.map