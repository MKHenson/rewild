package com.rewild.projects

import com.rewild.common.DeleteResult
import com.rewild.common.ErrorResponse
import com.rewild.common.userId
import com.rewild.models.ConfirmRequest
import com.rewild.models.Project
import com.rewild.models.ProjectImageResponse
import com.rewild.models.ProjectImageUploadRequest
import com.rewild.models.UploadUrlResponse
import io.github.smiley4.ktoropenapi.delete
import io.github.smiley4.ktoropenapi.get
import io.github.smiley4.ktoropenapi.post
import io.github.smiley4.ktoropenapi.put
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

private suspend inline fun <reified T : Any> ApplicationCall.respondImageResult(result: ImageResult<T>) = when (result) {
    is ImageResult.Success -> respond(result.value)
    is ImageResult.Invalid -> respond(HttpStatusCode.BadRequest, ErrorResponse(result.message))
    ImageResult.NotFound -> respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
    ImageResult.Forbidden -> respond(HttpStatusCode.Forbidden, ErrorResponse("Forbidden"))
    ImageResult.Unavailable -> respond(HttpStatusCode.ServiceUnavailable, ErrorResponse("Image storage is not configured"))
}

fun Route.projectRoutes(service: ProjectService, imageService: ProjectImageService) {
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

            post("/image/upload-url", {
                tags("Projects")
                summary = "Request project image upload URL"
                description = "Owner only. Returns a presigned PUT URL for a PNG, JPEG or WebP image up to 2 MB. The upload must send the requested Content-Type"
                request {
                    pathParameter<String>("id") { description = "Project ID" }
                    body<ProjectImageUploadRequest>()
                }
                response {
                    code(HttpStatusCode.OK) { body<UploadUrlResponse>() }
                    code(HttpStatusCode.BadRequest) { body<ErrorResponse>() }
                    code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                    code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                    code(HttpStatusCode.ServiceUnavailable) { body<ErrorResponse>() }
                }
            }) {
                val id = call.parameters["id"]!!
                val req = call.receive<ProjectImageUploadRequest>()
                call.respondImageResult(imageService.requestUploadUrl(call.userId(), id, req.contentType, req.size))
            }

            post("/image/confirm", {
                tags("Projects")
                summary = "Confirm project image upload"
                description = "Owner only. Checks the uploaded object, sets it as the project image and deletes the previous one"
                request {
                    pathParameter<String>("id") { description = "Project ID" }
                    body<ConfirmRequest>()
                }
                response {
                    code(HttpStatusCode.OK) { body<ProjectImageResponse>() }
                    code(HttpStatusCode.BadRequest) { body<ErrorResponse>() }
                    code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                    code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                    code(HttpStatusCode.ServiceUnavailable) { body<ErrorResponse>() }
                }
            }) {
                val id = call.parameters["id"]!!
                val req = call.receive<ConfirmRequest>()
                call.respondImageResult(imageService.confirmUpload(call.userId(), id, req.storageKey))
            }

            delete({
                tags("Projects")
                summary = "Delete project"
                description = "Deletes a project and its levels, and removes their files. The project stays as a tombstone so the owner's other devices drop it on their next sync"
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
