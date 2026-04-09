/**
 * Directed dependency graph using adjacency lists.
 * Edge A → B means "A imports B".
 */
declare class DepGraph {
    /** file → files it imports */
    private edges;
    /** file → files that import it (reverse) */
    private reverseEdges;
    addFile(file: string): void;
    addEdge(from: string, to: string): void;
    getImports(file: string): string[];
    getImportedBy(file: string): string[];
    getAllFiles(): string[];
    /**
     * BFS upward: find all files transitively affected when `file` changes.
     * Returns result sorted by depth (most directly affected first).
     */
    getImpacted(file: string): {
        file: string;
        depth: number;
    }[];
    /**
     * DFS-based cycle detection.
     * Returns array of cycles, each cycle is the list of files forming the loop.
     */
    detectCycles(): string[][];
    toJSON(): Record<string, {
        imports: string[];
        importedBy: string[];
    }>;
}

/**
 * Extract all import/require paths from file content.
 */
declare function extractImports(content: string): string[];
interface FileInfo {
    path: string;
    relativePath: string;
    imports: string[];
    linesOfCode: number;
    type: 'unknown' | 'react-component' | 'react-hook' | 'react-context' | 'nestjs-module' | 'nestjs-controller' | 'nestjs-service' | 'nestjs-guard' | 'nestjs-interceptor' | 'nestjs-pipe';
}
/**
 * Analyze all files in a directory and build a dependency graph.
 */
declare function analyzeFiles(root: string): {
    graph: DepGraph;
    files: FileInfo[];
};

interface ReactInfo {
    components: string[];
    hooks: string[];
    contexts: string[];
    hasRouter: boolean;
}
/**
 * Detect React-specific patterns and update FileInfo types.
 */
declare function analyzeReactFiles(files: FileInfo[]): ReactInfo;

interface NestJSModule {
    name: string;
    file: string;
    controllers: string[];
    providers: string[];
}
interface NestJSInfo {
    modules: NestJSModule[];
    controllers: string[];
    services: string[];
    guards: string[];
    interceptors: string[];
    pipes: string[];
}
/**
 * Detect NestJS-specific patterns and update FileInfo types.
 */
declare function analyzeNestJSFiles(files: FileInfo[], root: string): NestJSInfo;

interface HttpCall {
    method: string;
    url: string;
    pattern: 'axios' | 'fetch' | 'request' | 'useQuery' | 'nestjs-route' | 'instance';
}
interface HttpInfo {
    calls: HttpCall[];
    hasQueryHook: boolean;
    nestjsRoutes: HttpCall[];
    controllerPrefix: string;
}
/**
 * Detect HTTP call patterns in a file and return structured info.
 */
declare function detectHttpCalls(filePath: string): HttpInfo | null;
/**
 * Enrich FileInfo list with HTTP metadata.
 * Returns a map of filePath → HttpInfo for files that have HTTP activity.
 */
declare function analyzeHttpCalls(files: FileInfo[]): Map<string, HttpInfo>;

interface GitRiskEntry {
    churn: number;
    riskScore: number;
}
/**
 * Analyze git churn and risk score for all files.
 * Falls back gracefully if not a git repo.
 */
declare function analyzeGitRisk(root: string, files: FileInfo[], importedByCount: Map<string, number>): Map<string, GitRiskEntry>;

interface FileEntry {
    type: FileInfo['type'];
    imports: string[];
    importedBy: string[];
    importedByCount: number;
    linesOfCode: number;
    complexity: number;
    httpCalls: Array<{
        method: string;
        url: string;
        pattern: string;
    }>;
    nestjsRoutes: Array<{
        method: string;
        url: string;
    }>;
    hasQueryHook: boolean;
    unusedExports: string[];
    gitChurn: number;
    riskScore: number;
    package?: string;
}
interface SourceMapOutput {
    generated: string;
    root: string;
    framework: string[];
    totalFiles: number;
    packages?: string[];
    cycles: string[][];
    duplicates: Array<{
        name: string;
        files: string[];
    }>;
    files: Record<string, FileEntry>;
}
interface GenerateGraphOptions {
    root: string;
    graph: DepGraph;
    files: FileInfo[];
    frameworks: string[];
    httpMap?: Map<string, HttpInfo>;
    unusedExportsMap?: Record<string, string[]>;
    gitRiskMap?: Map<string, GitRiskEntry>;
    duplicates?: Array<{
        name: string;
        files: string[];
    }>;
    packageMap?: Map<string, string>;
}
/**
 * Generate the source-map.json output.
 */
declare function generateGraph(opts: GenerateGraphOptions): SourceMapOutput;

interface AnalyzeOptions {
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
interface AnalyzeResult {
    root: string;
    frameworks: string[];
    reactInfo?: ReactInfo;
    nestjsInfo?: NestJSInfo;
    sourceMap: SourceMapOutput;
    claudeMd: string;
    outputDir: string;
}
declare function analyze(options?: AnalyzeOptions): Promise<AnalyzeResult>;

/**
 * Analyze unused exports across all files.
 * Returns map of filePath → list of exported symbols not used anywhere else.
 */
declare function analyzeUnusedExports(files: FileInfo[]): Map<string, string[]>;

/**
 * Detect sub-package roots in a monorepo.
 * Supports: pnpm workspaces, yarn/npm workspaces, lerna.
 * Returns absolute paths of each sub-package root (excluding root itself).
 */
declare function detectMonorepo(root: string): string[];
/**
 * Returns true if the root looks like a monorepo.
 */
declare function isMonorepo(root: string): boolean;
/**
 * Get package name from package.json, fallback to dir basename.
 */
declare function getPackageName(pkgRoot: string): string;

/**
 * Recursively walk a directory and return all supported source files.
 * Respects .gitignore and skips common non-source directories.
 */
declare function walkFiles(root: string): string[];
/**
 * Resolve a relative import path from a source file to an absolute path.
 * Returns null if the import is not a local file (e.g., npm package).
 */
declare function resolveImport(fromFile: string, importPath: string, root: string): string | null;

interface ClaudeMdOptions {
    root: string;
    files: FileInfo[];
    graph: DepGraph;
    reactInfo?: ReactInfo;
    nestjsInfo?: NestJSInfo;
    frameworks: string[];
}
/**
 * Generate CLAUDE.md content for a repository.
 */
declare function generateClaudeMd(opts: ClaudeMdOptions): string;

interface ImpactResult {
    changedFile: string;
    impacted: {
        file: string;
        depth: number;
    }[];
    totalImpacted: number;
    criticalFiles: string[];
}
/**
 * Calculate the blast radius when a file changes.
 */
declare function calculateImpact(changedFile: string, root: string, graph: DepGraph): ImpactResult;
/**
 * Render impact result as a markdown report string.
 */
declare function renderImpactMarkdown(result: ImpactResult): string;

interface ApiMatchSummary {
    matched: number;
    unmatchedFrontend: Array<{
        method: string;
        url: string;
        file: string;
    }>;
    unmatchedBackend: Array<{
        method: string;
        url: string;
        file: string;
    }>;
}
/**
 * Generate HEALTH.md content from a source map.
 */
declare function generateHealthReport(sourceMap: SourceMapOutput, apiMatch?: ApiMatchSummary): string;

interface HtmlGraphOptions {
    minImporters?: number;
    title?: string;
}
declare function generateHtmlGraph(sourceMap: SourceMapOutput, opts?: HtmlGraphOptions): string;

export { type AnalyzeOptions, type AnalyzeResult, type ApiMatchSummary, type ClaudeMdOptions, DepGraph, type FileEntry, type FileInfo, type GenerateGraphOptions, type GitRiskEntry, type HtmlGraphOptions, type HttpCall, type HttpInfo, type ImpactResult, type NestJSInfo, type NestJSModule, type ReactInfo, type SourceMapOutput, analyze, analyzeFiles, analyzeGitRisk, analyzeHttpCalls, analyzeNestJSFiles, analyzeReactFiles, analyzeUnusedExports, calculateImpact, detectHttpCalls, detectMonorepo, extractImports, generateClaudeMd, generateGraph, generateHealthReport, generateHtmlGraph, getPackageName, isMonorepo, renderImpactMarkdown, resolveImport, walkFiles };
