package com.schemaflow

import com.google.gson.Gson
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.ui.jcef.JBCefBrowser
import java.awt.Dimension
import java.io.File
import javax.swing.JComponent

private data class SourceFile(val name: String, val content: String)

/** Tools → "SchemaFlow: Open Schema Diagram". */
class OpenSchemaFlowAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val files = collectSchemaFiles(project)
        if (files.isEmpty()) {
            Messages.showWarningDialog(
                project,
                "No schema files (.sql / .prisma / models.py / *.entity.ts) found in this project.",
                "SchemaFlow",
            )
            return
        }
        SchemaFlowDialog(project, buildHtml(files)).show()
    }

    private fun collectSchemaFiles(project: Project): List<SourceFile> {
        val base = project.basePath ?: return emptyList()
        val exts = setOf("sql", "prisma", "py", "ts")
        return File(base).walkTopDown()
            .onEnter { it.name != "node_modules" && !it.name.startsWith(".") }
            .filter { it.isFile && it.extension.lowercase() in exts }
            .map { SourceFile(it.relativeTo(File(base)).path, it.readText()) }
            .toList()
    }

    /** Inline the browser parser + a bootstrap that builds the model before the UI runs. */
    private fun buildHtml(files: List<SourceFile>): String {
        val filesJson = Gson().toJson(files)
        val ui = readResource("/web/index.html")
        val parser = readResource("/web/parser.browser.js")
        val inject = buildString {
            append("<script>").append(parser).append("</script>\n")
            append("<script>\n")
            append("window.__SCHEMAFLOW_FILES__ = ").append(filesJson).append(";\n")
            append("try { window.__SCHEMAFLOW_MODEL__ = SchemaFlowParser.parseProject(window.__SCHEMAFLOW_FILES__); }")
            append(" catch (e) { console.error(e); }\n")
            append("</script>")
        }
        return ui.replaceFirst("<head>", "<head>\n$inject")
    }

    private fun readResource(path: String): String =
        javaClass.getResourceAsStream(path)?.bufferedReader()?.use { it.readText() }
            ?: error("Missing bundled resource: $path (run scripts/build-jetbrains-web.mjs)")
}

private class SchemaFlowDialog(project: Project, html: String) : DialogWrapper(project) {
    private val browser = JBCefBrowser()

    init {
        title = "SchemaFlow"
        init()
        browser.loadHTML(html)
    }

    override fun createCenterPanel(): JComponent {
        browser.component.preferredSize = Dimension(1280, 820)
        return browser.component
    }
}
