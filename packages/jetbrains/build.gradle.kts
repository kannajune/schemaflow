plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.25"
    id("org.jetbrains.intellij.platform") version "2.2.1"
}

group = "com.schemaflow"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    implementation("com.google.code.gson:gson:2.11.0")
    intellijPlatform {
        // Works across IntelliJ IDEA, PyCharm, Rider, etc. (platform-only plugin).
        intellijIdeaCommunity("2024.2")
    }
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            sinceBuild = "242"
            untilBuild = provider { null }
        }
    }
}

kotlin {
    jvmToolchain(17)
}

// Regenerate the embedded web assets (UI + browser parser bundle) before packaging.
tasks.named("processResources") {
    doFirst {
        exec {
            commandLine("node", rootDir.resolve("../../scripts/build-jetbrains-web.mjs").absolutePath)
        }
    }
}
