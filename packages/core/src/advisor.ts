import type { SchemaModel } from './index.js';

export interface Suggestion {
  tag: 'no-pk' | 'observed' | 'inferred' | 'index' | 'audit';
  message: string;
  fix?: string;
}

/**
 * Deterministic schema advisor — no LLM, no tokens. Flags missing primary keys,
 * relationships lacking FK constraints (with the exact ALTER to fix), FK columns
 * that should be indexed, and tables missing audit timestamps.
 */
export function advise(model: SchemaModel): Suggestion[] {
  const s: Suggestion[] = [];

  for (const t of model.tables) {
    if (!t.columns.some((c) => c.isPrimaryKey)) {
      s.push({ tag: 'no-pk', message: `Table \`${t.name}\` has no primary key.` });
    }
  }

  for (const r of model.relationships) {
    if (r.kind !== 'declared') {
      s.push({
        tag: r.kind,
        message: `\`${r.from.table}.${r.from.column}\` references \`${r.to.table}\` with no FK constraint.`,
        fix: `ALTER TABLE ${r.from.table} ADD FOREIGN KEY (${r.from.column}) REFERENCES ${r.to.table}(${r.to.column});`,
      });
    }
  }

  const fkCols = [...new Set(model.relationships.map((r) => `${r.from.table}.${r.from.column}`))];
  for (const key of fkCols) {
    s.push({ tag: 'index', message: `Consider an index on FK column \`${key}\` for join performance.` });
  }

  for (const t of model.tables) {
    const names = t.columns.map((c) => c.name.toLowerCase());
    if (!names.includes('created_at') && !names.includes('updated_at')) {
      s.push({ tag: 'audit', message: `Table \`${t.name}\` has no created_at/updated_at timestamp.` });
    }
  }

  return s;
}

/** Render suggestions as a plain-text report (for CLI / CI output). */
export function formatAdvice(suggestions: Suggestion[]): string {
  if (!suggestions.length) return 'No suggestions — schema looks clean.';
  return suggestions
    .map((s) => `[${s.tag}] ${s.message}` + (s.fix ? `\n    ${s.fix}` : ''))
    .join('\n');
}
