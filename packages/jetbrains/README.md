# SchemaFlow for JetBrains (IntelliJ / PyCharm / Rider …)

Interactive database schema diagram inside JetBrains IDEs. The plugin reads the
project's schema files and renders the shared SchemaFlow UI in a JCEF webview.

The parser runs **in the webview** (bundled to `parser.browser.js`), so there's
no logic duplication and no Node requirement — the Kotlin side only collects
files and hands them to the page.

## Build

Requires Node (for the web assets) and a JDK 17.

```bash
# from the monorepo root — generate the embedded web assets:
node scripts/build-jetbrains-web.mjs

# then build the plugin:
cd packages/jetbrains
./gradlew buildPlugin        # -> build/distributions/schemaflow-jetbrains-*.zip
./gradlew runIde             # launch a sandbox IDE to try it
```

`processResources` also runs the web-asset script automatically.

## Use

**Tools → SchemaFlow: Open Schema Diagram** in any project containing
`.sql`, `schema.prisma`, `models.py`, or `*.entity.ts` files.

> Note: the UI loads React / React Flow from the esm.sh CDN at first paint
> (needs internet that first time); vendoring for full offline is a follow-up.
