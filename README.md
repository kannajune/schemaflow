# SchemaFlow

**Your database schema, read straight from your code — as an interactive diagram you can query and edit.**

Point it at any project. SchemaFlow parses your **SQL, Prisma, Django, SQLAlchemy
or TypeORM**, renders an interactive ER diagram, turns a click into a JOIN, and an
edit into a migration — all locally, no database connection, no LLM, no tokens.

> Not another static diagram renderer, and not a database client. It lives in your
> **codebase**, not against your database — so it runs offline, in CI, and in PRs.

### What makes it different

- **Honest relationships, three tiers.** It never pretends a guess is a fact:
  - 🟦 **declared** — a real FK constraint (solid)
  - 🟩 **observed** — seen in actual query JOINs, mined alias-aware from your SQL (dashed teal)
  - 🟧 **inferred** — only a naming match, `x_id` → table (dashed amber, "verify")
- **Diagram → SQL, deterministically.** Select two tables and it finds the join
  path (BFS, pulls in bridge tables) and writes the query — **$0 tokens**, instant,
  reproducible, never hallucinates a column.
- **Diagram ⇄ schema.** Edit a column in the UI → get the `ALTER TABLE`. Export
  **Mermaid / DBML**. A deterministic **advisor** flags missing PKs/FK constraints.
- **Runs everywhere a dev is allowed to work** — npm/`npx`, a standalone binary
  (no Node), a VS Code extension, a JetBrains plugin, and a GitHub Action.

Built in TypeScript by [**kannajune**](https://github.com/kannajune). MIT licensed —
use it, fork it, ship it.

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
| Standalone binary (`bun --compile`) | no-Node users (Python/Java/.NET) | ✅ **built** (release workflow + install.sh) |
| VS Code extension (webview) | editor users, any language | ✅ **built** (`packages/vscode`) |
| JetBrains plugin (PyCharm/IntelliJ/Rider) | JetBrains users | ✅ **built** (`packages/jetbrains`) |
| GitHub Action (headless → PR comment) | whole teams, zero install | ✅ **built** (`action.yml`) |

Build & publish the npm package:

```bash
npm run build                 # bundles packages/cli → dist (one file + UI)
cd packages/cli && npm publish # your npm login; publishes schemaflow-cli
# then anyone: npx schemaflow-cli ./their-project
```

## VS Code extension

Open an interactive schema diagram inside the editor — no Node install needed
(the extension host provides it). Reads the open workspace's schema files.

```bash
npm -w schemaflow-vscode run build     # bundle dist/extension.js
# press F5 in VS Code → "SchemaFlow: Open Schema Diagram"
npm -w schemaflow-vscode run package    # build a .vsix for the Marketplace
```

## Standalone binary (no Node needed)

For Python/Java/.NET/Go shops with no Node. Tagging `v*` runs the release workflow,
which cross-compiles a self-contained executable per OS (UI embedded inside it):

```bash
# one-line install (macOS / Linux)
curl -fsSL https://raw.githubusercontent.com/kannajune/schemaflow/main/scripts/install.sh | sh
schemaflow ./your-project
```

Windows: download `schemaflow-windows-x64.exe` from Releases. Build locally with Bun:
`npm run build:bin`.

> Note: the app logic is fully embedded, but the UI currently loads React/React Flow
> from the esm.sh CDN at first paint — fully-offline UI (vendored libs) is a follow-up.

## GitHub Action

Post an ER diagram + advisor as a sticky PR comment (Mermaid renders natively on GitHub).
Once `schemaflow-cli` is published, any repo can use it:

```yaml
# .github/workflows/schema.yml
on: pull_request
permissions: { contents: read, pull-requests: write }
jobs:
  schema:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: kannajune/schemaflow@v1
        with:
          path: .          # where your schema/migrations live
```

This repo also dogfoods it via `.github/workflows/schema-pr.yml` (builds locally).

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
