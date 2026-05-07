package com.rewild.projects

import com.rewild.common.DeleteResult
import com.rewild.common.ErrorResponse
import com.rewild.common.userId
import com.rewild.models.Project
import io.github.smiley4.ktoropenapi.delete
import io.github.smiley4.ktoropenapi.get
import io.github.smiley4.ktoropenapi.put
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.projectRoutes(service: ProjectService) {
    route("/projects") {
        get({
            tags("Projects")
            summary = "List projects"
            description = "Returns all projects for the authenticated user"
            response {
                code(HttpStatusCode.OK) { body<List<Project>>() }
            }
        }) {
            call.respond(service.getAll(call.userId()))
        }

        route("/{id}") {
            get({
                tags("Projects")
                summary = "Get project"
                description = "Returns a project by ID"
                request { pathParameter<String>("id") { description = "Project ID" } }
                response {
                    code(HttpStatusCode.OK) { body<Project>() }
                    code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                }
            }) {
                val id = call.parameters["id"]!!
                val project = service.getById(call.userId(), id)
                    ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                call.respond(project)
            }

            put({
                tags("Projects")
                summary = "Create or update project"
                description = "Upserts a project by ID. Path ID takes precedence over any ID in the request body."
                request {
                    pathParameter<String>("id") { description = "Project ID" }
                    body<Project>()
                }
                response {
                    code(HttpStatusCode.OK) { body<Project>() }
                    code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                }
            }) {
                val id = call.parameters["id"]!!
                val project = call.receive<Project>().copy(id = id)
                val result = service.upsert(call.userId(), project)
                    ?: return@put call.respond(HttpStatusCode.Forbidden, ErrorResponse("Forbidden"))
                call.respond(result)
            }

            delete({
                tags("Projects")
                summary = "Delete project"
                description = "Deletes a project and cascades to its associated levels"
                request { pathParameter<String>("id") { description = "Project ID" } }
                response {
                    code(HttpStatusCode.NoContent) { description = "Project deleted" }
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
