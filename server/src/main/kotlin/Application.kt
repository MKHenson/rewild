package com.rewild

import com.rewild.db.DatabaseFactory
import com.rewild.models.*
import io.github.smiley4.ktoropenapi.OpenApi
import io.github.smiley4.ktoropenapi.delete
import io.github.smiley4.ktoropenapi.get
import io.github.smiley4.ktoropenapi.openApi
import io.github.smiley4.ktoropenapi.post
import io.github.smiley4.ktoropenapi.put
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.module() {
    DatabaseFactory.init(this)
    configureApi()
}

// Used by GenerateSpec — no database, just routing for spec generation
fun Application.specModule() {
    configureApi()
}

private fun Application.configureApi() {
    install(ContentNegotiation) { json() }

    install(OpenApi) {
        info {
            title = "RE-WILD API"
            version = "0.0.1"
            description = "Mycelium — offline-first sync backend for RE-WILD"
        }
    }

    routing {
        route("/openapi.json") { openApi() }

        get("/health") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }

        route("/api") {
            projectRoutes()
            levelRoutes()
            syncRoutes()
        }
    }
}

private fun Route.projectRoutes() {
    route("/projects") {
        get({
            tags("Projects")
            summary = "List projects"
            description = "Returns all projects for the authenticated user"
            response {
                code(HttpStatusCode.OK) { body<List<Project>>() }
            }
        }) { call.respond(HttpStatusCode.NotImplemented) }

        post({
            tags("Projects")
            summary = "Create project"
            description = "Creates a new project"
            request { body<Project>() }
            response {
                code(HttpStatusCode.Created) { body<Project>() }
            }
        }) { call.respond(HttpStatusCode.NotImplemented) }

        route("/{id}") {
            get({
                tags("Projects")
                summary = "Get project"
                description = "Returns a project by ID"
                request { pathParameter<String>("id") { description = "Project ID" } }
                response {
                    code(HttpStatusCode.OK) { body<Project>() }
                }
            }) { call.respond(HttpStatusCode.NotImplemented) }

            put({
                tags("Projects")
                summary = "Update project"
                description = "Replaces an existing project"
                request {
                    pathParameter<String>("id") { description = "Project ID" }
                    body<Project>()
                }
                response {
                    code(HttpStatusCode.OK) { body<Project>() }
                }
            }) { call.respond(HttpStatusCode.NotImplemented) }

            delete({
                tags("Projects")
                summary = "Delete project"
                description = "Deletes a project and its associated levels"
                request { pathParameter<String>("id") { description = "Project ID" } }
                response {
                    code(HttpStatusCode.NoContent) { description = "Project deleted" }
                }
            }) { call.respond(HttpStatusCode.NotImplemented) }
        }
    }
}

private fun Route.levelRoutes() {
    route("/levels") {
        get({
            tags("Levels")
            summary = "List levels"
            description = "Returns all levels for the authenticated user"
            response {
                code(HttpStatusCode.OK) { body<List<Level>>() }
            }
        }) { call.respond(HttpStatusCode.NotImplemented) }

        post({
            tags("Levels")
            summary = "Create level"
            description = "Creates a new level"
            request { body<Level>() }
            response {
                code(HttpStatusCode.Created) { body<Level>() }
            }
        }) { call.respond(HttpStatusCode.NotImplemented) }

        route("/{id}") {
            get({
                tags("Levels")
                summary = "Get level"
                description = "Returns a level by ID"
                request { pathParameter<String>("id") { description = "Level ID" } }
                response {
                    code(HttpStatusCode.OK) { body<Level>() }
                }
            }) { call.respond(HttpStatusCode.NotImplemented) }

            put({
                tags("Levels")
                summary = "Update level"
                description = "Replaces an existing level"
                request {
                    pathParameter<String>("id") { description = "Level ID" }
                    body<Level>()
                }
                response {
                    code(HttpStatusCode.OK) { body<Level>() }
                }
            }) { call.respond(HttpStatusCode.NotImplemented) }

            delete({
                tags("Levels")
                summary = "Delete level"
                description = "Deletes a level by ID"
                request { pathParameter<String>("id") { description = "Level ID" } }
                response {
                    code(HttpStatusCode.NoContent) { description = "Level deleted" }
                }
            }) { call.respond(HttpStatusCode.NotImplemented) }
        }
    }
}

private fun Route.syncRoutes() {
    route("/sync") {
        post({
            tags("Sync")
            summary = "Sync"
            description = "Bidirectional sync: push dirty local records and pull server-side changes since lastSyncedAt"
            request { body<SyncRequest>() }
            response {
                code(HttpStatusCode.OK) { body<SyncResponse>() }
            }
        }) { call.respond(HttpStatusCode.NotImplemented) }
    }
}
