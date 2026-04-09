// Public API
export { analyze } from './analyze.js';
export type { AnalyzeOptions, AnalyzeResult } from './analyze.js';

export { analyzeFiles, extractImports } from './analyzers/base.js';
export type { FileInfo } from './analyzers/base.js';

export { analyzeReactFiles } from './analyzers/react.js';
export type { ReactInfo } from './analyzers/react.js';

export { analyzeNestJSFiles } from './analyzers/nestjs.js';
export type { NestJSInfo, NestJSModule } from './analyzers/nestjs.js';

export { analyzeHttpCalls, detectHttpCalls } from './analyzers/http.js';
export type { HttpInfo, HttpCall } from './analyzers/http.js';

export { analyzeUnusedExports } from './analyzers/exports.js';
export { analyzeGitRisk } from './analyzers/git.js';
export type { GitRiskEntry } from './analyzers/git.js';

export { detectMonorepo, isMonorepo, getPackageName } from './analyzers/monorepo.js';

export { DepGraph } from './utils/dep-graph.js';
export { walkFiles, resolveImport } from './utils/file-walker.js';

export { generateGraph } from './generators/graph.js';
export type { SourceMapOutput, FileEntry, GenerateGraphOptions } from './generators/graph.js';

export { generateClaudeMd } from './generators/claude-md.js';
export type { ClaudeMdOptions } from './generators/claude-md.js';

export { calculateImpact, renderImpactMarkdown } from './generators/impact-report.js';
export type { ImpactResult } from './generators/impact-report.js';

export { generateHealthReport } from './generators/health-report.js';
export type { ApiMatchSummary } from './generators/health-report.js';

export { generateHtmlGraph } from './generators/html-graph.js';
export type { HtmlGraphOptions } from './generators/html-graph.js';
