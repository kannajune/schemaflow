# SchemaFlow for VS Code

Visualize your database schema right inside the editor — interactive ER diagram
with the three-tier relationship taxonomy (declared / observed / inferred),
diagram⇄SQL, and a schema advisor.

Reads **SQL, Prisma, Django, SQLAlchemy and TypeORM** from your open workspace.
Because the extension host provides Node, you don't need Node installed yourself.

## Use

1. Open a project that contains schema files (`.sql`, `schema.prisma`, `models.py`, `*.entity.ts`).
2. Run **SchemaFlow: Open Schema Diagram** from the Command Palette.

## Develop

```bash
npm install
npm -w schemaflow-vscode run build   # bundles dist/extension.js
# then press F5 in VS Code to launch an Extension Development Host
npm -w schemaflow-vscode run package  # builds a .vsix
```
