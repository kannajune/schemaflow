import { parseSql, parseSourceFile, mergeModels, applyQueryEvidence } from './index.js';
import type { SchemaModel } from '@schemaflow/core';

export interface SourceFile {
  name: string;
  content: string;
}

/**
 * Build a SchemaModel from raw project files entirely in the browser. The parser
 * uses no Node APIs, so embedded hosts (JetBrains JCEF, etc.) can parse client-side
 * — the host just supplies file names + contents.
 */
export function parseProject(files: SourceFile[]): SchemaModel | null {
  const parsed: SchemaModel[] = [];
  const sqlTexts: string[] = [];

  for (const f of files) {
    if (/\.sql$/i.test(f.name)) {
      parsed.push(parseSql(f.content, f.name));
      sqlTexts.push(f.content);
    } else {
      const m = parseSourceFile(f.content, f.name, f.name);
      if (m) parsed.push(m);
    }
  }

  if (!parsed.length) return null;
  const model = mergeModels(parsed);
  applyQueryEvidence(model, sqlTexts);
  return model;
}
