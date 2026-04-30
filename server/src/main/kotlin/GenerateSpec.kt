package com.rewild

import io.github.smiley4.ktoropenapi.OpenApiPlugin
import io.github.smiley4.ktoropenapi.config.OpenApiPluginConfig
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import kotlinx.serialization.json.*
import java.io.File

private val prettyJson = Json { prettyPrint = true }

fun main() {
    embeddedServer(Netty, port = 0) {
        specModule()
    }.start(wait = false)

    Thread.sleep(500)

    val rawSpec = OpenApiPlugin.getOpenApiSpec(OpenApiPluginConfig.DEFAULT_SPEC_ID)
    val patched = patchWildcardRefs(Json.parseToJsonElement(rawSpec))

    val output = File("../openapi.json")
    output.writeText(prettyJson.encodeToString(JsonElement.serializer(), patched))
    println("openapi.json written to ${output.canonicalPath}")
}

// ktor-openapi emits {"$ref":"*"} for self-referential kotlinx JsonElement types.
// Replace these with {} so openapi-typescript treats them as `unknown`.
private fun patchWildcardRefs(element: JsonElement): JsonElement = when (element) {
    is JsonObject -> {
        if (element.size == 1 && element["\$ref"]?.jsonPrimitive?.content == "*")
            JsonObject(emptyMap())
        else
            JsonObject(element.entries.associate { (k, v) -> k to patchWildcardRefs(v) })
    }
    is JsonArray -> JsonArray(element.map { patchWildcardRefs(it) })
    else -> element
}
