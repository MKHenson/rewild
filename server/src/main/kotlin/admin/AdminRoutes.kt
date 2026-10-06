package com.rewild.admin

import com.rewild.common.ErrorResponse
import com.rewild.common.userId
import io.github.smiley4.ktoropenapi.get
import io.github.smiley4.ktoropenapi.post
import io.github.smiley4.ktoropenapi.put
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.adminRoutes(service: AdminService) {
    route("/admin") {
        install(SuperAdminGuard) { isSuperAdmin = service::isSuperAdmin }

        route("/users") {
            get({
                tags("Admin")
                summary = "List users"
                description = "Returns every user account. Super admin only."
                response {
                    code(HttpStatusCode.OK) { body<List<UserAccount>>() }
                    code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                }
            }) {
                call.respond(service.listUsers())
            }

            route("/{id}") {
                get({
                    tags("Admin")
                    summary = "Get user"
                    description = "Returns a user account by ID. Super admin only."
                    request { pathParameter<String>("id") { description = "User ID" } }
                    response {
                        code(HttpStatusCode.OK) { body<UserAccount>() }
                        code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                        code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                    }
                }) {
                    val user = service.getUser(call.parameters["id"]!!)
                        ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                    call.respond(user)
                }

                put({
                    tags("Admin")
                    summary = "Update user"
                    description = "Updates a user's editable fields. Super admin only."
                    request {
                        pathParameter<String>("id") { description = "User ID" }
                        body<UpdateUserRequest>()
                    }
                    response {
                        code(HttpStatusCode.OK) { body<UserAccount>() }
                        code(HttpStatusCode.BadRequest) { body<ErrorResponse>() }
                        code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                        code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                    }
                }) {
                    val req = call.receive<UpdateUserRequest>()
                    when (val result = service.updateUser(call.userId(), call.parameters["id"]!!, req)) {
                        is UpdateUserResult.Success -> call.respond(result.user)
                        is UpdateUserResult.Invalid -> call.respond(HttpStatusCode.BadRequest, ErrorResponse(result.reason))
                        UpdateUserResult.NotFound -> call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                    }
                }

                route("/password-reset") {
                    post({
                        tags("Admin")
                        summary = "Send password reset"
                        description = "Emails the user a password reset link. Super admin only."
                        request { pathParameter<String>("id") { description = "User ID" } }
                        response {
                            code(HttpStatusCode.NoContent) { description = "Reset email sent" }
                            code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                            code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                        }
                    }) {
                        if (!service.sendPasswordReset(call.parameters["id"]!!)) {
                            return@post call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                        }
                        call.respond(HttpStatusCode.NoContent)
                    }
                }
            }
        }
    }
}
