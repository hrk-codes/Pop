import { cp, mkdir, rm } from 'node:fs/promises';

import { build } from 'esbuild';

await rm('dist', { force: true, recursive: true });
await mkdir('dist', { recursive: true });

await Promise.all([
  build({
    entryPoints: ['src/background.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/background.js',
  }),
  build({
    entryPoints: ['src/content.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/content.js',
  }),
  build({ entryPoints: ['src/popup.ts'], bundle: true, format: 'iife', outfile: 'dist/popup.js' }),
]);

await Promise.all([
  cp('manifest.json', 'dist/manifest.json'),
  cp('src/popup.html', 'dist/popup.html'),
  cp('src/popup.css', 'dist/popup.css'),
]);
