# SchemaFlow

Interactive, accessible database-schema visualization — with diagram ⇄ SQL.

SchemaFlow reads any project's SQL / migrations (ORM models next) and renders a
clean, interactive schema you can click, expand, and query. It is **not** another
static diagram renderer. Its job is the interaction layer and one honest idea:

- **Declared relationships** (FK constraints in the DDL) are **facts** → solid edges.
- **Inferred relationships** (an `x_id` column matched to a table by naming, with
  no constraint) are **guesses** → dashed edges you verify.

Rendering uses **React Flow** (interactive) with Mermaid export planned. The tool
is **language-agnostic**: it reads any app's schema regardless of what that app is
written in. Built in TypeScript, shipped as a CLI.

## Quick start

```bash
cd schemaflow
npm install
npm run dev          # parses examples/ (schema + queries), opens UI on :4000
```

Then open http://localhost:4000

Point it at any project:

```bash
npm run schemaflow -- /path/to/your/app      # scans for *.sql
npm run schemaflow -- ../zerodha-trading-agent
npm run schemaflow -- examples/trading.sql --json   # machine-readable model
```

## Headless / CI usage

No browser, no server — prints to stdout (powers scripting and the GitHub Action):

```bash
npm run schemaflow -- ./app --mermaid    # Mermaid erDiagram (renders on GitHub)
npm run schemaflow -- ./app --dbml       # DBML (dbdiagram.io)
npm run schemaflow -- ./app --advise     # schema advisor report (missing PK/FK, indexes…)
npm run schemaflow -- ./app --json       # full SchemaModel
```

## Distribution channels (planned)

One TypeScript core, thin adapters per channel — so company tool policies never block adoption:

| Channel | For | Status |
|---------|-----|--------|
| npm / `npx` (`schemaflow-cli`) | Node devs | ✅ **built** — `npm run build` → `npm publish` |
| Standalone binary (`bun --compile`) | no-Node users (Python/Java/.NET) | planned |
| VS Code extension (webview) | editor users, any language | planned |
| JetBrains plugin (PyCharm/IntelliJ/Rider) | JetBrains users | planned |
| GitHub Action (headless → PR comment) | whole teams, zero install | core ready (`--mermaid`/`--advise`) |

Build & publish the npm package:

```bash
npm run build                 # bundles packages/cli → dist (one file + UI)
cd packages/cli && npm publish # your npm login; publishes schemaflow-cli
# then anyone: npx schemaflow-cli ./their-project
```

## Monorepo layout

```
packages/
  core     — SchemaModel types (facts vs inferred), shared everywhere
  parser   — SQL/DDL → SchemaModel (regex MVP; swap a real parser later)
  server   — zero-dep http server: serves UI + /api/schema
  cli      — `schemaflow <path>` entry point
  server/public/index.html — React Flow UI
examples/
  trading.sql — Auto-Trade-style schema (declared + implicit FKs)
```

## Roadmap

- [x] ORM model parsers (Prisma, SQLAlchemy, Django, TypeORM)
- [x] Relationship inference from query JOINs (alias-aware) — upgrades guesses to `observed`
- [x] Diagram → SQL: select tables → generated JOIN/SELECT (auto join-path finding)
- [x] Edit in diagram → ALTER/migration SQL (add / rename / drop columns)
- [x] Mermaid / DBML export (Export tab)
- [x] Schema advisor: missing PK/FK constraints, FK indexes, audit columns (deterministic, no LLM)
- [x] Collapse/expand + accessibility (ARIA labels, real buttons) for large schemas
```

Point it at ORM projects:

```bash
npm run schemaflow -- examples-orm        # Prisma + Django + TypeORM samples
npm run schemaflow -- /path/to/app        # mixes *.sql, *.prisma, models.py, *.entity.ts
```
