// Generates packages/cli/src/html.generated.ts from the UI html so the bundle /
// standalone binary can serve the UI without depending on a sibling file.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(repo, 'packages/server/public/index.html'), 'utf8');
const out =
  '// AUTO-GENERATED from packages/server/public/index.html — do not edit.\n' +
  `export const INDEX_HTML = ${JSON.stringify(html)};\n`;

// Emit to every package that embeds the UI (cli binary, vscode webview).
for (const dir of ['packages/cli/src', 'packages/vscode/src']) {
  if (existsSync(path.join(repo, dir))) {
    writeFileSync(path.join(repo, dir, 'html.generated.ts'), out);
    console.log(`embed-html: wrote ${dir}/html.generated.ts (${html.length} bytes)`);
  }
}
