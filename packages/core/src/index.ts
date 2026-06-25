/**
 * SchemaFlow core model.
 *
 * The whole design hinges on one distinction: a relationship is either a
 * `declared` FACT (a FOREIGN KEY constraint we read from the DDL) or an
 * `inferred` GUESS (we matched a column to a table by naming convention,
 * with no constraint to back it up). The UI renders these differently —
 * solid vs dashed — so a human can trust the facts and verify the guesses.
 */

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
}

export type RelationshipKind = 'declared' | 'observed' | 'inferred';

export interface Relationship {
  id: string;
  from: { table: string; column: string };
  to: { table: string; column: string };
  /**
   * declared = FK constraint in DDL (solid, fact);
   * observed = seen in real query JOIN/predicate (dashed, evidence-backed);
   * inferred = naming-convention guess only (dashed, verify).
   */
  kind: RelationshipKind;
  /** 1.0 for declared; lower for observed/inferred. */
  confidence: number;
  /** Number of query JOIN/predicate occurrences backing this edge, if any. */
  evidence?: number;
  /** Human-readable justification, shown on hover. */
  reason: string;
}

export interface Table {
  name: string;
  columns: Column[];
}

export interface SchemaModel {
  tables: Table[];
  relationships: Relationship[];
  meta: {
    source: string;
    generatedAt: string;
    declaredCount: number;
    observedCount: number;
    inferredCount: number;
  };
}

export { toMermaid, toDbml } from './export.js';
export { advise, formatAdvice } from './advisor.js';
export type { Suggestion } from './advisor.js';

/** Recompute the per-kind relationship counts in model.meta. */
export function recomputeMeta(model: SchemaModel): SchemaModel {
  const count = (k: RelationshipKind) => model.relationships.filter((r) => r.kind === k).length;
  model.meta.declaredCount = count('declared');
  model.meta.observedCount = count('observed');
  model.meta.inferredCount = count('inferred');
  return model;
}

/** Merge several parsed models (e.g. one per .sql file) into a single schema. */
export function mergeModels(models: SchemaModel[], source = 'merged'): SchemaModel {
  const tablesByName = new Map<string, Table>();
  const relationships: Relationship[] = [];

  for (const m of models) {
    for (const t of m.tables) {
      if (!tablesByName.has(t.name)) tablesByName.set(t.name, t);
    }
    relationships.push(...m.relationships);
  }

  const tables = [...tablesByName.values()];
  const count = (k: RelationshipKind) => relationships.filter((r) => r.kind === k).length;

  return {
    tables,
    relationships,
    meta: {
      source,
      generatedAt: new Date().toISOString(),
      declaredCount: count('declared'),
      observedCount: count('observed'),
      inferredCount: count('inferred'),
    },
  };
}
