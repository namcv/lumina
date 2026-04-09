import fs from 'node:fs';
import path from 'node:path';
import type { FileInfo } from './base.js';

const MODULE_RE = /@Module\s*\(/;
const CONTROLLER_RE = /@Controller\s*\(/;
const INJECTABLE_RE = /@Injectable\s*\(/;
const GUARD_RE = /@(?:CanActivate|UseGuards)\s*\(|implements\s+CanActivate/;
const INTERCEPTOR_RE = /@(?:UseInterceptors|NestInterceptor)\s*\(|implements\s+NestInterceptor/;
const PIPE_RE = /@(?:UsePipes|PipeTransform)\s*\(|implements\s+PipeTransform/;

export interface NestJSModule {
  name: string;
  file: string;
  controllers: string[];
  providers: string[];
}

export interface NestJSInfo {
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
export function analyzeNestJSFiles(files: FileInfo[], root: string): NestJSInfo {
  const info: NestJSInfo = {
    modules: [],
    controllers: [],
    services: [],
    guards: [],
    interceptors: [],
    pipes: [],
  };

  for (const file of files) {
    if (!file.path.endsWith('.ts') && !file.path.endsWith('.js')) continue;

    let content: string;
    try {
      content = fs.readFileSync(file.path, 'utf-8');
    } catch {
      continue;
    }

    if (MODULE_RE.test(content)) {
      file.type = 'nestjs-module';
      const name = extractClassName(content) ?? path.basename(file.path, path.extname(file.path));
      info.modules.push({
        name,
        file: file.relativePath,
        controllers: extractArrayItems(content, 'controllers'),
        providers: extractArrayItems(content, 'providers'),
      });
      continue;
    }

    if (CONTROLLER_RE.test(content)) {
      file.type = 'nestjs-controller';
      info.controllers.push(file.relativePath);
      continue;
    }

    if (GUARD_RE.test(content)) {
      file.type = 'nestjs-guard';
      info.guards.push(file.relativePath);
      continue;
    }

    if (INTERCEPTOR_RE.test(content)) {
      file.type = 'nestjs-interceptor';
      info.interceptors.push(file.relativePath);
      continue;
    }

    if (PIPE_RE.test(content)) {
      file.type = 'nestjs-pipe';
      info.pipes.push(file.relativePath);
      continue;
    }

    if (INJECTABLE_RE.test(content)) {
      file.type = 'nestjs-service';
      info.services.push(file.relativePath);
    }
  }

  return info;
}

function extractClassName(content: string): string | null {
  const match = content.match(/export\s+class\s+(\w+)/);
  return match?.[1] ?? null;
}

/** Extract items from @Module({ controllers: [...] }) */
function extractArrayItems(content: string, key: string): string[] {
  const re = new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)]`);
  const match = content.match(re);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('//'));
}
