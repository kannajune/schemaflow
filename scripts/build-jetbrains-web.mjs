// Builds the web resources the JetBrains plugin embeds in its JCEF webview:
//   - index.html  (the shared SchemaFlow UI)
//   - parser.browser.js  (the parser bundled for the browser, exposes SchemaFlowParser)
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(repo, 'packages/jetbrains/src/main/resources/web');
mkdirSync(webDir, { recursive: true });

copyFileSync(
  path.join(repo, 'packages/server/public/index.html'),
  path.join(webDir, 'index.html'),
);

execFileSync(
  'npx',
  [
    'esbuild',
    'packages/parser/src/browser.ts',
    '--bundle',
    '--format=iife',
    '--global-name=SchemaFlowParser',
    '--platform=browser',
    `--outfile=${path.join(webDir, 'parser.browser.js')}`,
  ],
  { cwd: repo, stdio: 'inherit' },
);

console.log('build-jetbrains-web: wrote packages/jetbrains/src/main/resources/web/{index.html,parser.browser.js}');
