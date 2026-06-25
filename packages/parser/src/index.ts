import type { Column, Relationship, SchemaModel, Table } from '@schemaflow/core';
import { recomputeMeta } from '@schemaflow/core';

export { mergeModels, recomputeMeta } from '@schemaflow/core';
export { parsePrisma, parsePython, parseTypeORM, parseSourceFile } from './orm.js';

/**
 * MVP SQL parser. Handles CREATE TABLE with inline + table-level PRIMARY KEY
 * and FOREIGN KEY constraints. This is deliberately regex-based for v1 — good
 * enough to prove the model. Swap in a real dialect parser (sql-parser-cst, or
 * a sqlglot sidecar) later without touching the SchemaModel contract.
 */
export function parseSql(sql: string, source = 'sql'): SchemaModel {
  const clean = stripComments(sql);
  const tables: Table[] = [];
  const declared: Relationship[] = [];

  const createRe =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?["`']?(\w+)["`']?\s*\(([\s\S]*?)\)\s*;/gi;

  let m: RegExpExecArray | null;
  while ((m = createRe.exec(clean)) !== null) {
    const tableName = m[1]!;
    const { columns, fks } = parseBody(m[2]!, tableName);
    tables.push({ name: tableName, columns });
    declared.push(...fks);
  }

  return finalizeModel(tables, declared, source);
}

/**
 * Shared tail used by every front-end parser (SQL, Prisma, ORM): run naming-based
 * inference over whatever the parser already knows, then assemble the SchemaModel.
 */
export function finalizeModel(tables: Table[], declared: Relationship[], source: string): SchemaModel {
  const inferred = inferRelationships(tables, declared);
  return {
    tables,
    relationships: [...declared, ...inferred],
    meta: {
      source,
      generatedAt: new Date().toISOString(),
      declaredCount: declared.length,
      observedCount: 0,
      inferredCount: inferred.length,
    },
  };
}

interface ColRef {
  table: string;
  column: string;
}

/**
 * Mine SQL query text for equi-join predicates (`a.x = b.y`) in JOIN ... ON and
 * WHERE clauses. Resolves table aliases (`FROM orders o JOIN accounts a`) so the
 * refs point at real tables, not aliases. Returns unoriented column pairs.
 */
export function extractJoinEvidence(sql: string, known: Set<string>): { a: ColRef; b: ColRef }[] {
  const pairs: { a: ColRef; b: ColRef }[] = [];
  const stop = /^(on|using|where|inner|left|right|full|outer|cross|join|group|order|having|limit|as)$/i;

  for (const stmt of stripComments(sql).split(';')) {
    // Build alias -> real table map for this statement.
    const alias: Record<string, string> = {};
    const aliasRe = /(?:from|join)\s+["`']?(\w+)["`']?(?:\s+(?:as\s+)?["`']?(\w+)["`']?)?/gi;
    let am: RegExpExecArray | null;
    while ((am = aliasRe.exec(stmt)) !== null) {
      const table = am[1]!;
      if (!known.has(table.toLowerCase())) continue;
      alias[table.toLowerCase()] = table;
      const al = am[2];
      if (al && !stop.test(al)) alias[al.toLowerCase()] = table;
    }

    // Find `prefix.col = prefix.col` equalities and resolve prefixes via alias map.
    const eqRe = /(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/g;
    let em: RegExpExecArray | null;
    while ((em = eqRe.exec(stmt)) !== null) {
      const lt = alias[em[1]!.toLowerCase()];
      const rt = alias[em[3]!.toLowerCase()];
      if (!lt || !rt || lt === rt) continue;
      pairs.push({ a: { table: lt, column: em[2]! }, b: { table: rt, column: em[4]! } });
    }
  }
  return pairs;
}

/**
 * Apply mined query evidence to a model: upgrade `inferred` (naming) edges to
 * `observed` when seen in real queries, annotate `declared` ones, and add brand
 * new `observed` edges the schema/naming never surfaced. Mutates and returns model.
 */
export function applyQueryEvidence(model: SchemaModel, sqlTexts: string[]): SchemaModel {
  const tableByName = new Map(model.tables.map((t) => [t.name.toLowerCase(), t]));
  const known = new Set(tableByName.keys());

  // Count evidence per canonical (oriented FK -> PK) edge.
  const counts = new Map<string, number>();
  for (const sql of sqlTexts) {
    for (const { a, b } of extractJoinEvidence(sql, known)) {
      const { from, to } = orient(a, b, tableByName);
      const key = `${from.table}.${from.column}|${to.table}.${to.column}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  for (const [key, count] of counts) {
    const [fromStr, toStr] = key.split('|') as [string, string];
    const from = parseRef(fromStr);
    const to = parseRef(toStr);

    const existing = model.relationships.find(
      (r) =>
        (sameRef(r.from, from) && sameRef(r.to, to)) ||
        (sameRef(r.from, to) && sameRef(r.to, from)),
    );

    if (existing) {
      existing.evidence = (existing.evidence ?? 0) + count;
      if (existing.kind === 'inferred') {
        existing.kind = 'observed';
        existing.confidence = 0.85;
        existing.reason = `Observed in ${existing.evidence} query JOIN/predicate(s) — upgraded from a naming guess.`;
      } else if (existing.kind === 'declared') {
        existing.reason = existing.reason.replace(/ · also observed.*$/, '');
        existing.reason += ` · also observed in ${existing.evidence} query JOIN(s).`;
      } else {
        existing.reason = `Observed in ${existing.evidence} query JOIN/predicate(s).`;
      }
    } else {
      model.relationships.push({
        id: `o_${from.table}_${from.column}_${model.relationships.length}`,
        from,
        to,
        kind: 'observed',
        confidence: 0.8,
        evidence: count,
        reason: `Observed in ${count} query JOIN/predicate(s) — no FK constraint or naming match.`,
      });
    }
  }

  return recomputeMeta(model);
}

function parseRef(s: string): ColRef {
  const dot = s.indexOf('.');
  return { table: s.slice(0, dot), column: s.slice(dot + 1) };
}

function sameRef(a: ColRef, b: ColRef): boolean {
  return a.table.toLowerCase() === b.table.toLowerCase() && a.column.toLowerCase() === b.column.toLowerCase();
}

/** Orient an equi-join pair as FK(from) -> PK(to) using primary-key info / naming. */
function orient(a: ColRef, b: ColRef, tableByName: Map<string, Table>): { from: ColRef; to: ColRef } {
  const isPk = (ref: ColRef) =>
    !!tableByName
      .get(ref.table.toLowerCase())
      ?.columns.find((c) => c.name.toLowerCase() === ref.column.toLowerCase())?.isPrimaryKey;

  if (isPk(b) && !isPk(a)) return { from: a, to: b };
  if (isPk(a) && !isPk(b)) return { from: b, to: a };
  if (/_id$/i.test(a.column) && !/_id$/i.test(b.column)) return { from: a, to: b };
  if (/_id$/i.test(b.column) && !/_id$/i.test(a.column)) return { from: b, to: a };
  return { from: a, to: b };
}

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Split a CREATE TABLE body on top-level commas (ignoring those inside parens). */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function extractParenCols(s: string): string[] {
  const m = s.match(/\(([^)]+)\)/);
  if (!m) return [];
  return m[1]!.split(',').map((x) => x.trim().replace(/["`']/g, ''));
}

function declaredRel(
  fromTable: string,
  fromCol: string,
  toTable: string,
  toCol: string,
  seq: number,
): Relationship {
  return {
    id: `d_${fromTable}_${fromCol}_${seq}`,
    from: { table: fromTable, column: fromCol },
    to: { table: toTable, column: toCol },
    kind: 'declared',
    confidence: 1,
    reason: `FOREIGN KEY declared in DDL: ${fromTable}.${fromCol} → ${toTable}.${toCol}`,
  };
}

function parseBody(body: string, tableName: string): { columns: Column[]; fks: Relationship[] } {
  const columns: Column[] = [];
  const fks: Relationship[] = [];
  const pkCols = new Set<string>();
  let seq = 0;

  for (const raw of splitTopLevel(body)) {
    const line = raw.trim();
    if (!line) continue;

    // Table-level PRIMARY KEY (col, ...)
    if (/^primary\s+key/i.test(line)) {
      for (const c of extractParenCols(line)) pkCols.add(c);
      continue;
    }

    // Table-level FOREIGN KEY (col) REFERENCES other(col)
    if (/^(constraint\s+\w+\s+)?foreign\s+key/i.test(line)) {
      const localCols = extractParenCols(line);
      const ref = line.match(/references\s+["`']?(\w+)["`']?\s*\(([^)]+)\)/i);
      if (ref && localCols.length) {
        const refTable = ref[1]!;
        const refCols = ref[2]!.split(',').map((s) => s.trim().replace(/["`']/g, ''));
        localCols.forEach((lc, i) => {
          fks.push(declaredRel(tableName, lc, refTable, refCols[i] ?? refCols[0] ?? 'id', seq++));
        });
      }
      continue;
    }

    // Other table-level constraints we don't model yet.
    if (/^(unique|check|constraint|key|index)\b/i.test(line)) continue;

    // Column definition: `name TYPE ...`
    const col = line.match(/^["`']?(\w+)["`']?\s+([A-Za-z0-9_]+(?:\s*\([^)]*\))?)/);
    if (!col) continue;

    const name = col[1]!;
    const type = col[2]!.replace(/\s+/g, '');
    const isPk = /primary\s+key/i.test(line);
    if (isPk) pkCols.add(name);

    columns.push({
      name,
      type,
      nullable: !/not\s+null/i.test(line),
      isPrimaryKey: isPk,
    });

    // Inline `... REFERENCES other(col)`
    const inlineRef = line.match(/references\s+["`']?(\w+)["`']?\s*\(([^)]+)\)/i);
    if (inlineRef) {
      const refCol = inlineRef[2]!.split(',')[0]!.trim().replace(/["`']/g, '');
      fks.push(declaredRel(tableName, name, inlineRef[1]!, refCol, seq++));
    }
  }

  for (const c of columns) if (pkCols.has(c.name)) c.isPrimaryKey = true;
  return { columns, fks };
}

/** Naming-convention candidates for a FK base, e.g. "user" -> users / user / ... */
function nameCandidates(base: string): string[] {
  const set = new Set<string>([base, `${base}s`, `${base}es`]);
  if (base.endsWith('y')) set.add(`${base.slice(0, -1)}ies`);
  if (base.endsWith('s')) set.add(base.slice(0, -1));
  return [...set];
}

/**
 * The "guess" layer: any `*_id` column without a declared FK is matched to a
 * table by naming convention and emitted as an INFERRED relationship (dashed,
 * confidence < 1). This is where queries add value over the schema alone.
 */
function inferRelationships(tables: Table[], declared: Relationship[]): Relationship[] {
  const byName = new Map(tables.map((t) => [t.name.toLowerCase(), t]));
  const declaredKeys = new Set(declared.map((r) => `${r.from.table}.${r.from.column}`));
  const inferred: Relationship[] = [];
  let seq = 0;

  for (const t of tables) {
    for (const c of t.columns) {
      const fk = c.name.match(/^(.*)_id$/i);
      if (!fk) continue;
      if (declaredKeys.has(`${t.name}.${c.name}`)) continue;

      const base = fk[1]!.toLowerCase();
      let target: Table | undefined;
      for (const cand of nameCandidates(base)) {
        const hit = byName.get(cand);
        if (hit) {
          target = hit;
          break;
        }
      }
      if (!target) continue;

      const pk =
        target.columns.find((col) => col.isPrimaryKey) ??
        target.columns.find((col) => col.name.toLowerCase() === 'id');

      inferred.push({
        id: `i_${t.name}_${c.name}_${seq++}`,
        from: { table: t.name, column: c.name },
        to: { table: target.name, column: pk?.name ?? 'id' },
        kind: 'inferred',
        confidence: 0.6,
        reason: `No FK constraint found. Column \`${c.name}\` matches table \`${target.name}\` by naming convention — verify before trusting.`,
      });
    }
  }

  return inferred;
}
