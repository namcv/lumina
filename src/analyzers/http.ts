import fs from 'node:fs';
import type { FileInfo } from './base.js';

// ── React / frontend HTTP patterns ─────────────────────────────────────────
const AXIOS_CALL_RE   = /axios\s*\.\s*(?:get|post|put|delete|patch|head)\s*\(\s*['"`]([^'"`\n]+)['"`]/gi;
const FETCH_CALL_RE   = /\bfetch\s*\(\s*['"`]([^'"`\n]+)['"`]/gi;
// umi-request string style: request('/api/...', { method })
const UMI_REQUEST_STR_RE = /\brequest\s*\(\s*['"`]([^'"`\n]+)['"`]/gi;
// umi-request object style: request({ url: SOMETHING, method: 'POST' })
const UMI_REQUEST_OBJ_RE = /\brequest\s*\(\s*\{[^}]*url\s*:\s*([^\s,}\n]+)[^}]*\}/gi;
const UMI_METHOD_RE      = /method\s*:\s*['"](\w+)['"]/i;
// Axios instance: api.get('/...'), http.post('/...')
const INST_CALL_RE    = /\b\w+\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"`](\/[^'"`\n]*)['"`]/gi;
// React Query / TanStack hooks that wrap API calls
const USE_QUERY_RE    = /\buse(?:Query|InfiniteQuery|Mutation)\s*\(/g;

// ── NestJS route decorators ─────────────────────────────────────────────────
const NEST_ROUTE_RE   = /@(Get|Post|Put|Delete|Patch|Head|Options|All)\s*\(\s*['"`]?([^'"`\n\)]*?)['"`]?\s*\)/gi;
const NEST_CTRL_RE    = /@Controller\s*\(\s*['"`]?([^'"`\n\)]*?)['"`]?\s*\)/i;

export interface HttpCall {
  method: string;   // GET | POST | PUT | DELETE | PATCH | UNKNOWN
  url: string;
  pattern: 'axios' | 'fetch' | 'request' | 'useQuery' | 'nestjs-route' | 'instance';
}

export interface HttpInfo {
  calls: HttpCall[];
  hasQueryHook: boolean;       // uses useQuery/useMutation
  nestjsRoutes: HttpCall[];    // only for NestJS controllers
  controllerPrefix: string;    // @Controller('/prefix')
}

/**
 * Detect HTTP call patterns in a file and return structured info.
 */
export function detectHttpCalls(filePath: string): HttpInfo | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const calls: HttpCall[] = [];
  const nestjsRoutes: HttpCall[] = [];

  // axios.get/post/...
  for (const m of matchAll(content, AXIOS_CALL_RE)) {
    calls.push({ method: extractMethod(m[0]), url: normalizeUrl(m[1]), pattern: 'axios' });
  }

  // fetch(...)
  for (const m of matchAll(content, FETCH_CALL_RE)) {
    if (m[1].startsWith('/') || m[1].startsWith('http') || m[1].includes('api')) {
      calls.push({ method: 'GET', url: normalizeUrl(m[1]), pattern: 'fetch' });
    }
  }

  // request('/api/...') — umi string style
  for (const m of matchAll(content, UMI_REQUEST_STR_RE)) {
    if (m[1].startsWith('/') || m[1].includes('api')) {
      calls.push({ method: extractMethodFromContext(content, m.index!), url: normalizeUrl(m[1]), pattern: 'request' });
    }
  }

  // request({ url: ENDPOINT_API.XXX, method: 'POST' }) — umi object style
  for (const m of matchAll(content, UMI_REQUEST_OBJ_RE)) {
    const block = m[0];
    const methodMatch = block.match(UMI_METHOD_RE);
    const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
    const urlToken = m[1].trim().replace(/[,}].*/, ''); // e.g. ENDPOINT_API.Something
    calls.push({ method, url: urlToken, pattern: 'request' });
  }

  // instance.get/post('/...')
  for (const m of matchAll(content, INST_CALL_RE)) {
    calls.push({ method: extractMethod(m[0]), url: normalizeUrl(m[1]), pattern: 'instance' });
  }

  // useQuery / useMutation presence
  const hasQueryHook = USE_QUERY_RE.test(content);
  USE_QUERY_RE.lastIndex = 0;

  // NestJS routes
  const ctrlMatch = content.match(NEST_CTRL_RE);
  const controllerPrefix = ctrlMatch ? normalizeUrl(ctrlMatch[1] ?? '') : '';

  for (const m of matchAll(content, NEST_ROUTE_RE)) {
    const httpMethod = m[1].toUpperCase();
    const routePath = controllerPrefix
      ? `${controllerPrefix}/${m[2]}`.replace(/\/+/g, '/')
      : normalizeUrl(m[2]);
    nestjsRoutes.push({ method: httpMethod, url: routePath, pattern: 'nestjs-route' });
  }

  if (calls.length === 0 && nestjsRoutes.length === 0 && !hasQueryHook) return null;

  return { calls, hasQueryHook, nestjsRoutes, controllerPrefix };
}

/**
 * Enrich FileInfo list with HTTP metadata.
 * Returns a map of filePath → HttpInfo for files that have HTTP activity.
 */
export function analyzeHttpCalls(files: FileInfo[]): Map<string, HttpInfo> {
  const result = new Map<string, HttpInfo>();
  for (const file of files) {
    const info = detectHttpCalls(file.path);
    if (info) result.set(file.path, info);
  }
  return result;
}

// ── helpers ────────────────────────────────────────────────────────────────

function matchAll(content: string, re: RegExp): RegExpExecArray[] {
  const results: RegExpExecArray[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) results.push(m);
  re.lastIndex = 0;
  return results;
}

function extractMethod(raw: string): string {
  const lower = raw.toLowerCase();
  for (const m of ['post', 'put', 'delete', 'patch', 'head']) {
    if (lower.includes(`.${m}(`)) return m.toUpperCase();
  }
  return 'GET';
}

function extractMethodFromContext(content: string, idx: number): string {
  // Look backwards up to 100 chars for method: 'POST'
  const before = content.slice(Math.max(0, idx - 100), idx);
  const m = before.match(/method\s*:\s*['"](\w+)['"]/i);
  return m ? m[1].toUpperCase() : 'GET';
}

function normalizeUrl(url: string): string {
  return '/' + url.replace(/^\/+/, '').replace(/\/+$/, '');
}
