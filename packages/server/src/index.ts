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
export function startServer(model: SchemaModel, port = 4000, htmlPath?: string): http.Server {
  const indexPath = htmlPath ?? path.join(here, '..', 'public', 'index.html');

  const server = http.createServer((req, res) => {
    if (req.url === '/api/schema') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(model));
      return;
    }
    fs.readFile(indexPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('UI not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(data);
    });
  });

  server.listen(port);
  return server;
}
