import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  // Inline the workspace packages so the published artifact has zero runtime deps.
  noExternal: [/@schemaflow\//],
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  // Ship the UI alongside the bundle so the server can serve it.
  onSuccess: async () => {
    copyFileSync(
      path.join(dir, '..', 'server', 'public', 'index.html'),
      path.join(dir, 'dist', 'index.html'),
    );
  },
});
