import fs from 'node:fs';
import type { FileInfo } from './base.js';

// Patterns for React detection
const REACT_COMPONENT_RE = /(?:export\s+default\s+function|export\s+(?:default\s+)?(?:const|function)\s+[A-Z])/;
const JSX_RE = /(?:<[A-Z][a-zA-Z]*|<\/[A-Z]|React\.createElement)/;
const HOOK_RE = /(?:export\s+(?:default\s+)?(?:const|function)\s+(use[A-Z][a-zA-Z]*))/;
const CONTEXT_RE = /(?:createContext|React\.createContext)/;
const ROUTER_RE = /(?:from\s+['"]react-router|<Route\s|<Link\s|<BrowserRouter|<Switch)/;

export interface ReactInfo {
  components: string[];
  hooks: string[];
  contexts: string[];
  hasRouter: boolean;
}

/**
 * Detect React-specific patterns and update FileInfo types.
 */
export function analyzeReactFiles(files: FileInfo[]): ReactInfo {
  const info: ReactInfo = {
    components: [],
    hooks: [],
    contexts: [],
    hasRouter: false,
  };

  for (const file of files) {
    const isTsx = file.path.endsWith('.tsx');
    let content: string;
    try {
      content = fs.readFileSync(file.path, 'utf-8');
    } catch {
      continue;
    }

    const hasJsx = isTsx || JSX_RE.test(content);
    const hasContext = CONTEXT_RE.test(content);

    // Check for custom hooks first (more specific)
    const hookMatch = content.match(HOOK_RE);
    if (hookMatch) {
      file.type = 'react-hook';
      info.hooks.push(file.relativePath);
      continue;
    }

    // Check for context
    if (hasContext) {
      file.type = 'react-context';
      info.contexts.push(file.relativePath);
      continue;
    }

    // Check for React component
    if (hasJsx && REACT_COMPONENT_RE.test(content)) {
      file.type = 'react-component';
      info.components.push(file.relativePath);
    }

    // Router detection (can co-exist)
    if (ROUTER_RE.test(content)) {
      info.hasRouter = true;
    }
  }

  return info;
}
