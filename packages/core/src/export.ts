import type { SchemaModel } from './index.js';

/** Mermaid `erDiagram` text — renders natively in GitHub/Markdown. */
export function toMermaid(model: SchemaModel): string {
  const out: string[] = ['erDiagram'];
  for (const t of model.tables) {
    out.push(`  ${t.name} {`);
    for (const c of t.columns) {
      const type = (c.type || 'text').replace(/\(.*\)/, '') || 'text';
      out.push(`    ${type} ${c.name}${c.isPrimaryKey ? ' PK' : ''}`);
    }
    out.push('  }');
  }
  for (const r of model.relationships) {
    // PK side is the "one" parent, FK side the "many" child.
    out.push(`  ${r.to.table} ||--o{ ${r.from.table} : "${r.from.column}"`);
  }
  return out.join('\n');
}

/** DBML (dbdiagram.io) text. Non-declared relationships are annotated. */
export function toDbml(model: SchemaModel): string {
  const out: string[] = [];
  for (const t of model.tables) {
    out.push(`Table ${t.name} {`);
    for (const c of t.columns) {
      const attrs: string[] = [];
      if (c.isPrimaryKey) attrs.push('pk');
      if (!c.nullable && !c.isPrimaryKey) attrs.push('not null');
      out.push(`  ${c.name} ${(c.type || 'text').toLowerCase()}${attrs.length ? ` [${attrs.join(', ')}]` : ''}`);
    }
    out.push('}', '');
  }
  for (const r of model.relationships) {
    const note = r.kind !== 'declared' ? `  // ${r.kind}` : '';
    out.push(`Ref: ${r.from.table}.${r.from.column} > ${r.to.table}.${r.to.column}${note}`);
  }
  return out.join('\n');
}
