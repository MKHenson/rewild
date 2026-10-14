package com.rewild.admin

import com.rewild.common.ErrorResponse
import com.rewild.common.userId
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

fun Route.adminRoutes(service: AdminService) {
    route("/admin") {
        install(SuperAdminGuard) { isSuperAdmin = service::isSuperAdmin }

        route("/projects") {
            get({
                tags("Admin")
                summary = "List projects"
                description = "Returns one page of every live project of every user. Super admin only."
                request {
                    queryParameter<Int>("page") { description = "Zero-based page. Defaults to 0" }
                    queryParameter<Int>("pageSize") { description = "Defaults to 25, at most 100" }
                    queryParameter<String>("sort") { description = "name, author, updated or flagged. Defaults to updated" }
                    queryParameter<String>("order") { description = "asc or desc. Defaults to desc" }
                }
                response {
                    code(HttpStatusCode.OK) { body<AdminProjectPage>() }
                    code(HttpStatusCode.BadRequest) { body<ErrorResponse>() }
                    code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
                }
            }) {
                val params = call.request.queryParameters
                val sort = params["sort"]?.let { value ->
                    AdminProjectSort.entries.find { it.name.equals(value, ignoreCase = true) }
                        ?: return@get call.respond(HttpStatusCode.BadRequest, ErrorResponse("Unknown sort"))
                } ?: AdminProjectSort.UPDATED
                val descending = when (params["order"]?.lowercase()) {
                    null, "desc" -> true
                    "asc" -> false
                    else -> return@get call.respond(HttpStatusCode.BadRequest, ErrorResponse("Unknown order"))
                }
                call.respond(
                    service.listProjects(
                        page = params["page"]?.toIntOrNull() ?: 0,
                        pageSize = params["pageSize"]?.toIntOrNull() ?: 25,
                        sort = sort,
                        descending = descending,
                    )
                )
            }
        }

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

/** `/projects/{id}/flag`, beside the owner's project routes. Super admin only. */
fun Route.projectFlagRoutes(service: AdminService) {
    route("/projects/{id}/flag") {
        install(SuperAdminGuard) { isSuperAdmin = service::isSuperAdmin }

        post({
            tags("Admin")
            summary = "Flag project"
            description = "Blocks a project: only its owner and super admins can play it. The public game cannot be flagged. Super admin only."
            request { pathParameter<String>("id") { description = "Project ID" } }
            response {
                code(HttpStatusCode.NoContent) { description = "Flagged" }
                code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                code(HttpStatusCode.Conflict) { body<ErrorResponse>() }
                code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
            }
        }) {
            call.respondFlagResult(service.flagProject(call.userId(), call.parameters["id"]!!))
        }

        delete({
            tags("Admin")
            summary = "Unflag project"
            description = "Lifts the block on a project. Super admin only."
            request { pathParameter<String>("id") { description = "Project ID" } }
            response {
                code(HttpStatusCode.NoContent) { description = "Unflagged" }
                code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
            }
        }) {
            call.respondFlagResult(service.unflagProject(call.parameters["id"]!!))
        }
    }
}

private suspend fun ApplicationCall.respondFlagResult(result: FlagResult) = when (result) {
    FlagResult.Success -> respond(HttpStatusCode.NoContent)
    FlagResult.NotFound -> respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
    FlagResult.PublicGame -> respond(
        HttpStatusCode.Conflict,
        ErrorResponse("This project is the public game. Remove it from Story Mode before you flag it")
    )
}
