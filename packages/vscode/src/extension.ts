import * as vscode from 'vscode';
import { parseSql, parseSourceFile, mergeModels, applyQueryEvidence } from '@schemaflow/parser';
import type { SchemaModel } from '@schemaflow/core';
import { INDEX_HTML } from './html.generated';

export function activate(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand('schemaflow.open', async () => {
    const model = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'SchemaFlow: scanning workspace…' },
      () => buildModel(),
    );
    if (!model) {
      vscode.window.showWarningMessage(
        'SchemaFlow: no schema files (.sql / .prisma / models.py / *.entity.ts) found in this workspace.',
      );
      return;
    }
    const panel = vscode.window.createWebviewPanel('schemaflow', 'SchemaFlow', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    panel.webview.html = renderHtml(model);
  });
  context.subscriptions.push(cmd);
}

/** Scan the open workspace, parse every schema source, and build the model. */
async function buildModel(): Promise<SchemaModel | undefined> {
  const files = await vscode.workspace.findFiles('**/*.{sql,prisma,py,ts}', '**/node_modules/**', 5000);
  const parsed: SchemaModel[] = [];
  const sqlTexts: string[] = [];

  for (const uri of files) {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString('utf8');
    const rel = vscode.workspace.asRelativePath(uri);
    let model: SchemaModel | null;
    if (uri.path.toLowerCase().endsWith('.sql')) {
      model = parseSql(text, rel);
      sqlTexts.push(text);
    } else {
      model = parseSourceFile(text, uri.path, rel);
    }
    if (model) parsed.push(model);
  }

  if (!parsed.length) return undefined;
  const merged = mergeModels(parsed);
  applyQueryEvidence(merged, sqlTexts);
  return merged;
}

/** Inject the model + a webview CSP into the shared UI html. */
function renderHtml(model: SchemaModel): string {
  // Everything (React, React Flow, CSS) is inlined — no remote origins needed.
  const csp =
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
    `img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:;">`;
  const inject = `<script>window.__SCHEMAFLOW_MODEL__ = ${JSON.stringify(model)};</script>`;
  // Function replacer: the model JSON can contain `$` sequences that a plain
  // replacement string would mis-interpret.
  return INDEX_HTML.replace('<head>', () => `<head>\n${csp}\n${inject}`);
}

export function deactivate(): void {}
