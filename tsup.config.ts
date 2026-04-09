import { defineConfig } from 'tsup';

export default defineConfig([
  // Library entry (ESM + CJS)
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  // CLI entry (CJS only — Node shebang)
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['cjs'],
    dts: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
    sourcemap: false,
  },
]);
