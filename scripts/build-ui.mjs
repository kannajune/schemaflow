// Bundles the UI (app + React + React Flow + htm) and inlines it — together with
// the React Flow CSS — into a single self-contained packages/server/public/index.html.
// No CDN, no external requests: the diagram works fully offline in every channel.
import esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...x) => path.join(repo, ...x);

const result = await esbuild.build({
  entryPoints: [p('packages/server/ui/app.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: ['es2020'],
  // React's CJS build branches on this; without it the browser bundle throws.
  define: { 'process.env.NODE_ENV': '"production"' },
});

let js = result.outputFiles[0].text;
// Guard against any literal </script> inside the bundle breaking the inline tag.
js = js.replace(/<\/script>/gi, '<\\/script>');

const css = readFileSync(p('node_modules/reactflow/dist/style.css'), 'utf8');
const tpl = readFileSync(p('packages/server/ui/index.template.html'), 'utf8');

// Function replacers — a plain replacement string would interpret `$&`/`` $` ``
// patterns that occur inside the minified bundle and corrupt it.
const out = tpl
  .replace('<!--RF_CSS-->', () => `<style>\n${css}\n</style>`)
  .replace('<!--APP-->', () => `<script>\n${js}\n</script>`);

writeFileSync(p('packages/server/public/index.html'), out);
console.log(`build-ui: wrote public/index.html (${(out.length / 1024).toFixed(0)} KB, offline)`);
