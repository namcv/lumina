import { describe, it, expect } from 'vitest';
import { extractImports } from '../analyzers/base.js';

describe('extractImports', () => {
  it('extracts static import paths', () => {
    const code = `
      import React from 'react';
      import { foo } from './foo';
      import type { Bar } from '../bar';
    `;
    const imports = extractImports(code);
    expect(imports).toContain('react');
    expect(imports).toContain('./foo');
    expect(imports).toContain('../bar');
  });

  it('extracts re-exports', () => {
    const code = `export { foo } from './utils';`;
    expect(extractImports(code)).toContain('./utils');
  });

  it('extracts require calls', () => {
    const code = `const x = require('./config');`;
    expect(extractImports(code)).toContain('./config');
  });

  it('extracts dynamic import()', () => {
    const code = `const mod = await import('./lazy');`;
    expect(extractImports(code)).toContain('./lazy');
  });

  it('handles multiple imports in one file', () => {
    const code = `
      import a from './a';
      import b from './b';
      import c from './c';
    `;
    const imports = extractImports(code);
    expect(imports).toHaveLength(3);
  });
});
