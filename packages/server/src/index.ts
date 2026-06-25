import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SchemaModel } from '@schemaflow/core';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Tiny zero-dependency server: serves the React Flow UI and the parsed schema
 * as JSON. No express on purpose — keeps the `npx` install story light.
 */
/**
 * Tiny zero-dependency server. Serves the UI from a file when one exists (dev:
 * live-edits the html each request) and otherwise from an embedded string
 * (standalone binary: no sibling file to read).
 */
export function startServer(
  model: SchemaModel,
  port = 4000,
  htmlPath?: string,
  htmlFallback?: string,
): http.Server {
  const defaultPath = path.join(here, '..', 'public', 'index.html');
  const filePath =
    htmlPath && fs.existsSync(htmlPath)
      ? htmlPath
      : !htmlFallback && fs.existsSync(defaultPath)
        ? defaultPath
        : undefined;

  const server = http.createServer((req, res) => {
    if (req.url === '/api/schema') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(model));
      return;
    }
    if (filePath) {
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end('UI not found');
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(data);
      });
      return;
    }
    if (htmlFallback) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(htmlFallback);
      return;
    }
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('UI not found');
  });

  server.listen(port);
  return server;
}
