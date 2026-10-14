package com.rewild.shares

import com.rewild.common.ErrorResponse
import com.rewild.common.userId
import com.rewild.models.AddShareRequest
import com.rewild.models.ProjectShare
import io.github.smiley4.ktoropenapi.delete
import io.github.smiley4.ktoropenapi.get
import io.github.smiley4.ktoropenapi.post
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

private suspend inline fun <reified T : Any> ApplicationCall.respondShareResult(result: ShareResult<T>) = when (result) {
    is ShareResult.Success -> respond(result.value)
    else -> respondShareError(result)
}

private suspend fun ApplicationCall.respondShareError(result: ShareResult<*>) = when (result) {
    is ShareResult.Invalid -> respond(HttpStatusCode.BadRequest, ErrorResponse(result.message))
    ShareResult.Forbidden -> respond(HttpStatusCode.Forbidden, ErrorResponse("Forbidden"))
    ShareResult.Flagged -> respond(
        HttpStatusCode.Conflict,
        ErrorResponse("This project is flagged and cannot be shared. Contact an admin if you think this is a mistake")
    )
    else -> respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
}

/** `/projects/{id}/shares`. Owner only. */
fun Route.shareRoutes(service: ShareService) {
    route("/projects/{id}/shares") {
        get({
            tags("Shares")
            summary = "List shares"
            description = "Owner only. Returns the users the project is shared with, newest first"
            request { pathParameter<String>("id") { description = "Project ID" } }
            response {
                code(HttpStatusCode.OK) { body<List<ProjectShare>>() }
                code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
            }
        }) {
            call.respondShareResult(service.list(call.userId(), call.parameters["id"]!!))
        }

        post({
            tags("Shares")
            summary = "Add share"
            description = "Owner only. Gives a user play access to the project. Adding an existing share returns it. A flagged project cannot be shared"
            request {
                pathParameter<String>("id") { description = "Project ID" }
                body<AddShareRequest>()
            }
            response {
                code(HttpStatusCode.OK) { body<ProjectShare>() }
                code(HttpStatusCode.BadRequest) { body<ErrorResponse>() }
                code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                code(HttpStatusCode.Conflict) { body<ErrorResponse>() }
            }
        }) {
            val req = call.receive<AddShareRequest>()
            call.respondShareResult(service.add(call.userId(), call.parameters["id"]!!, req.userId))
        }

        delete("/{userId}", {
            tags("Shares")
            summary = "Revoke share"
            description = "Owner only. Removes a user's play access. It takes effect on their next start"
            request {
                pathParameter<String>("id") { description = "Project ID" }
                pathParameter<String>("userId") { description = "User ID" }
            }
            response {
                code(HttpStatusCode.NoContent) { description = "Share revoked" }
                code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
            }
        }) {
            when (val result = service.revoke(call.userId(), call.parameters["id"]!!, call.parameters["userId"]!!)) {
                is ShareResult.Success -> call.respond(HttpStatusCode.NoContent)
                else -> call.respondShareError(result)
            }
        }
    }
}
