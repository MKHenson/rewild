val ktorVersion = "3.0.3"
val exposedVersion = "0.55.0"
val flywayVersion = "10.13.0"

plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.serialization") version "2.0.21"
    id("io.ktor.plugin") version "3.0.3"
}

group = "com.rewild"
version = "0.0.1"

application {
    mainClass.set("io.ktor.server.netty.EngineMain")
    applicationDefaultJvmArgs = listOf("-Dio.ktor.development=${project.ext.has("development")}")
}

kotlin {
    jvmToolchain(21)
}

tasks.register<JavaExec>("generateSpec") {
    description = "Generates openapi.json by booting a spec-only server (no DB required)"
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("com.rewild.GenerateSpecKt")
    dependsOn("classes")
}

tasks.named<JavaExec>("run") {
    val envFile = file(".env")
    if (envFile.exists()) {
        envFile.readLines()
            .filter { it.isNotBlank() && !it.startsWith("#") }
            .map { it.split("=", limit = 2) }
            .filter { it.size == 2 }
            .forEach { (key, value) -> environment(key.trim(), value.trim()) }
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("io.ktor:ktor-server-core-jvm")
    implementation("io.ktor:ktor-server-netty-jvm")
    implementation("io.ktor:ktor-server-content-negotiation-jvm")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm")
    implementation("io.ktor:ktor-server-auth-jvm")
    implementation("io.ktor:ktor-server-auth-jwt-jvm")
    implementation("org.jetbrains.exposed:exposed-core:$exposedVersion")
    implementation("org.jetbrains.exposed:exposed-dao:$exposedVersion")
    implementation("org.jetbrains.exposed:exposed-jdbc:$exposedVersion")
    implementation("org.postgresql:postgresql:42.7.3")
    implementation("org.flywaydb:flyway-core:$flywayVersion")
    implementation("org.flywaydb:flyway-database-postgresql:$flywayVersion")
    implementation("io.github.smiley4:ktor-openapi:5.0.0")
    implementation("com.zaxxer:HikariCP:5.1.0")
    implementation("ch.qos.logback:logback-classic:1.5.6")
    testImplementation("io.ktor:ktor-server-test-host-jvm")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit")
}
