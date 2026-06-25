import type { Column, Relationship, SchemaModel, Table } from '@schemaflow/core';
import { finalizeModel } from './index.js';

/** Dispatch a source file to the right ORM/DSL parser by extension + content. */
export function parseSourceFile(text: string, filename: string, source: string): SchemaModel | null {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (ext === '.prisma') return parsePrisma(text, source);
  if (ext === '.py' && /models\.Model|Column\s*\(|declarative_base|DeclarativeBase/.test(text))
    return parsePython(text, source);
  if (ext === '.ts' && /@Entity\s*\(/.test(text)) return parseTypeORM(text, source);
  return null; // not an ORM file we recognise
}

function declaredRel(
  fromTable: string,
  fromCol: string,
  toTable: string,
  toCol: string,
  seq: number,
  why: string,
): Relationship {
  return {
    id: `d_${fromTable}_${fromCol}_${seq}`,
    from: { table: fromTable, column: fromCol },
    to: { table: toTable, column: toCol },
    kind: 'declared',
    confidence: 1,
    reason: `${why}: ${fromTable}.${fromCol} → ${toTable}.${toCol}`,
  };
}

// ----------------------------------------------------------------------------
// Prisma (schema.prisma)
// ----------------------------------------------------------------------------
export function parsePrisma(text: string, source = 'prisma'): SchemaModel {
  const tables: Table[] = [];
  const declared: Relationship[] = [];
  const scalar = /^(String|Boolean|Int|BigInt|Float|Decimal|DateTime|Json|Bytes)$/;
  const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let seq = 0;
  let m: RegExpExecArray | null;

  while ((m = modelRe.exec(text)) !== null) {
    const name = m[1]!;
    const columns: Column[] = [];

    for (const raw of m[2]!.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;

      const parts = line.split(/\s+/);
      const fname = parts[0];
      const ftype = parts[1];
      if (!fname || !ftype) continue;

      const baseType = ftype.replace(/[?[\]]/g, '');

      // `@relation(fields: [localCol], references: [refCol])` -> declared FK.
      const rel = line.match(/@relation\([^)]*fields:\s*\[(\w+)\][^)]*references:\s*\[(\w+)\]/);
      if (rel) {
        declared.push(declaredRel(name, rel[1]!, baseType, rel[2]!, seq++, 'Prisma @relation'));
        continue; // relation object field, not a stored column
      }

      if (ftype.endsWith('[]')) continue; // inverse relation list
      if (!scalar.test(baseType)) continue; // relation object field without @relation here

      columns.push({
        name: fname,
        type: baseType.toUpperCase(),
        nullable: ftype.endsWith('?'),
        isPrimaryKey: /@id\b/.test(line),
      });
    }
    tables.push({ name, columns });
  }
  return finalizeModel(tables, declared, source);
}

// ----------------------------------------------------------------------------
// Python: SQLAlchemy + Django models
// ----------------------------------------------------------------------------
const DJANGO_TYPES: Record<string, string> = {
  CharField: 'VARCHAR',
  TextField: 'TEXT',
  IntegerField: 'INTEGER',
  BigIntegerField: 'BIGINT',
  BooleanField: 'BOOLEAN',
  DateTimeField: 'TIMESTAMP',
  DateField: 'DATE',
  DecimalField: 'NUMERIC',
  FloatField: 'FLOAT',
  AutoField: 'BIGINT',
  BigAutoField: 'BIGINT',
  EmailField: 'VARCHAR',
  UUIDField: 'UUID',
};

export function parsePython(text: string, source = 'python'): SchemaModel {
  const tables: Table[] = [];
  const declared: Relationship[] = [];
  let seq = 0;

  const classRe = /class\s+(\w+)\s*\(([^)]*)\)\s*:/g;
  const matches = [...text.matchAll(classRe)];

  for (let i = 0; i < matches.length; i++) {
    const cm = matches[i]!;
    const className = cm[1]!;
    const bases = cm[2]!;
    const bodyStart = cm.index! + cm[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
    const body = text.slice(bodyStart, bodyEnd);

    const isDjango = /models\.Model/.test(bases);
    const isSA = /Base\b/.test(bases) || /Column\s*\(/.test(body);
    if (!isDjango && !isSA) continue;

    let tableName = className;
    const tn = body.match(/__tablename__\s*=\s*['"](\w+)['"]/);
    if (tn) tableName = tn[1]!;

    const columns: Column[] = [];
    let hasPk = false;

    for (const raw of body.split('\n')) {
      const line = raw.trim();

      // SQLAlchemy: name = Column(Type, ... primary_key=True, ForeignKey('t.c'))
      const sa = line.match(/^(\w+)\s*=\s*Column\((.*)\)\s*$/);
      if (sa) {
        const col = sa[1]!;
        const args = sa[2]!;
        const typeM = args.match(/^\s*(\w+)/);
        const pk = /primary_key\s*=\s*True/.test(args);
        if (pk) hasPk = true;
        columns.push({
          name: col,
          type: typeM ? typeM[1]!.toUpperCase() : 'TEXT',
          nullable: !pk && !/nullable\s*=\s*False/.test(args),
          isPrimaryKey: pk,
        });
        const fk = args.match(/ForeignKey\(\s*['"](\w+)\.(\w+)['"]/);
        if (fk) declared.push(declaredRel(tableName, col, fk[1]!, fk[2]!, seq++, 'SQLAlchemy ForeignKey'));
        continue;
      }

      // Django: name = models.XField(...)
      const dj = line.match(/^(\w+)\s*=\s*models\.(\w+)\(([\s\S]*?)\)\s*$/);
      if (dj) {
        const fld = dj[1]!;
        const ftype = dj[2]!;
        const args = dj[3]!;
        if (ftype === 'ForeignKey' || ftype === 'OneToOneField') {
          const tgt = args.match(/^\s*['"]?(\w+)['"]?/);
          const tgtName = tgt ? tgt[1]! : '';
          const colName = `${fld}_id`;
          columns.push({ name: colName, type: 'BIGINT', nullable: /null\s*=\s*True/.test(args), isPrimaryKey: false });
          const target = tgtName === 'self' || tgtName === '' ? tableName : tgtName;
          if (target) declared.push(declaredRel(tableName, colName, target, 'id', seq++, `Django ${ftype}`));
          continue;
        }
        const pk = ftype === 'AutoField' || ftype === 'BigAutoField' || /primary_key\s*=\s*True/.test(args);
        if (pk) hasPk = true;
        columns.push({
          name: fld,
          type: DJANGO_TYPES[ftype] ?? ftype.toUpperCase(),
          nullable: /null\s*=\s*True/.test(args),
          isPrimaryKey: pk,
        });
        continue;
      }
    }

    // Django auto-adds an `id` PK if none was declared.
    if (isDjango && !hasPk) columns.unshift({ name: 'id', type: 'BIGINT', nullable: false, isPrimaryKey: true });
    if (columns.length) tables.push({ name: tableName, columns });
  }
  return finalizeModel(tables, declared, source);
}

// ----------------------------------------------------------------------------
// TypeORM (decorators) — best effort
// ----------------------------------------------------------------------------
export function parseTypeORM(text: string, source = 'typeorm'): SchemaModel {
  const tables: Table[] = [];
  const declared: Relationship[] = [];
  let seq = 0;

  const classRe = /@Entity\([^)]*\)\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g;
  const matches = [...text.matchAll(classRe)];

  for (let i = 0; i < matches.length; i++) {
    const name = matches[i]![1]!;
    const start = matches[i]!.index!;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
    const body = text.slice(start, end);

    const columns: Column[] = [];

    // Plain columns: @Column(...) / @Primary*Column(...) name: type
    const colRe = /@(PrimaryGeneratedColumn|PrimaryColumn|Column)\(([^)]*)\)\s*(\w+)\s*[!?]?\s*:/g;
    let cm: RegExpExecArray | null;
    while ((cm = colRe.exec(body)) !== null) {
      const deco = cm[1]!;
      const args = cm[2]!;
      const typeM = args.match(/['"](\w+)['"]/);
      columns.push({
        name: cm[3]!,
        type: (typeM ? typeM[1]! : 'VARCHAR').toUpperCase(),
        nullable: /nullable:\s*true/.test(args),
        isPrimaryKey: deco.startsWith('Primary'),
      });
    }

    // Relations: @ManyToOne(() => Target) field:  (nested parens handled separately)
    const relRe = /@(ManyToOne|OneToOne)\(\s*\(\)\s*=>\s*(\w+)[\s\S]*?\)\s*(\w+)\s*[!?]?\s*:/g;
    let rm: RegExpExecArray | null;
    while ((rm = relRe.exec(body)) !== null) {
      declared.push(declaredRel(name, `${rm[3]!}Id`, rm[2]!, 'id', seq++, `TypeORM ${rm[1]!}`));
    }

    if (columns.length) tables.push({ name, columns });
  }
  return finalizeModel(tables, declared, source);
}
