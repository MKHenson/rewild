package com.rewild.levels

import com.rewild.common.DeleteResult
import com.rewild.common.ErrorResponse
import com.rewild.common.userId
import com.rewild.models.Level
import io.github.smiley4.ktoropenapi.delete
import io.github.smiley4.ktoropenapi.get
import io.github.smiley4.ktoropenapi.put
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.levelRoutes(service: LevelService) {
    route("/levels") {
        get({
            tags("Levels")
            summary = "List levels"
            description = "Returns all levels for the authenticated user"
            response {
                code(HttpStatusCode.OK) { body<List<Level>>() }
            }
        }) {
            call.respond(service.getAll(call.userId()))
        }

        route("/{id}") {
            get({
                tags("Levels")
                summary = "Get level"
                description = "Returns a level by ID"
                request { pathParameter<String>("id") { description = "Level ID" } }
                response {
                    code(HttpStatusCode.OK) { body<Level>() }
                    code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                }
            }) {
                val id = call.parameters["id"]!!
                val level = service.getById(call.userId(), id)
                    ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                call.respond(level)
            }

            put({
                tags("Levels")
                summary = "Create or update level"
                description = "Upserts a level by ID. Path ID takes precedence over any ID in the request body."
                request {
                    pathParameter<String>("id") { description = "Level ID" }
                    body<Level>()
                }
                response {
                    code(HttpStatusCode.OK) { body<Level>() }
                    code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                }
            }) {
                val id = call.parameters["id"]!!
                val level = call.receive<Level>().copy(id = id)
                val result = service.upsert(call.userId(), level)
                    ?: return@put call.respond(HttpStatusCode.Forbidden, ErrorResponse("Forbidden"))
                call.respond(result)
            }

            delete({
                tags("Levels")
                summary = "Delete level"
                description = "Deletes a level by ID"
                request { pathParameter<String>("id") { description = "Level ID" } }
                response {
                    code(HttpStatusCode.NoContent) { description = "Level deleted" }
                    code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                    code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                }
            }) {
                val id = call.parameters["id"]!!
                when (service.delete(call.userId(), id)) {
                    DeleteResult.NotFound -> return@delete call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                    DeleteResult.Forbidden -> return@delete call.respond(HttpStatusCode.Forbidden, ErrorResponse("Forbidden"))
                    DeleteResult.Success -> call.respond(HttpStatusCode.NoContent)
                }
            }
        }
    }
}
