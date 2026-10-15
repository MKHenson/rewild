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
            description = "Returns the live projects the caller owns, or that are shared with the caller, newest first"
            request { queryParameter<String>("scope") { description = "mine or shared. Defaults to mine" } }
            response {
                code(HttpStatusCode.OK) { body<List<Project>>() }
                code(HttpStatusCode.BadRequest) { body<ErrorResponse>() }
            }
        }) {
            val scope = call.request.queryParameters["scope"]?.let { value ->
                ProjectScope.entries.find { it.name.equals(value, ignoreCase = true) }
                    ?: return@get call.respond(HttpStatusCode.BadRequest, ErrorResponse("Unknown scope"))
            } ?: ProjectScope.MINE
            call.respond(service.list(call.userId(), scope))
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
                    ?.takeIf { it.deletedAt == null }
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
                description = "Deletes a project and its levels, and removes their files. The project stays as a tombstone so the owner's other devices drop it on their next sync. The public game cannot be deleted"
                request { pathParameter<String>("id") { description = "Project ID" } }
                response {
                    code(HttpStatusCode.NoContent) { description = "Project deleted" }
                    code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                    code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                    code(HttpStatusCode.Conflict) { body<ErrorResponse>() }
                }
            }) {
                val id = call.parameters["id"]!!
                when (service.delete(call.userId(), id)) {
                    DeleteResult.NotFound -> return@delete call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                    DeleteResult.Forbidden -> return@delete call.respond(HttpStatusCode.Forbidden, ErrorResponse("Forbidden"))
                    DeleteResult.Conflict -> return@delete call.respond(
                        HttpStatusCode.Conflict,
                        ErrorResponse("This project is the public game. An admin must remove it from Story Mode before it can be deleted")
                    )
                    DeleteResult.Success -> call.respond(HttpStatusCode.NoContent)
                }
            }
        }
    }
}
