import { mkdir, rm } from 'node:fs/promises';

import { build } from 'esbuild';

await rm('dist', { force: true, recursive: true });
await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  outfile: 'dist/extension.cjs',
  platform: 'node',
  target: 'node20',
});
