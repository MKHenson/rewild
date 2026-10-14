package com.rewild.users

import com.rewild.common.userId
import com.rewild.models.UserSummary
import io.github.smiley4.ktoropenapi.get
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.userRoutes(service: UserService) {
    route("/users/search") {
        get({
            tags("Users")
            summary = "Search users"
            description = "Matches a display name by prefix ($USER_SEARCH_MIN_LENGTH characters minimum) or an email exactly. Returns at most $USER_SEARCH_LIMIT users, never the caller and never an email"
            request { queryParameter<String>("q") { description = "Display name prefix or exact email" } }
            response {
                code(HttpStatusCode.OK) { body<List<UserSummary>>() }
            }
        }) {
            call.respond(service.search(call.userId(), call.request.queryParameters["q"] ?: ""))
        }
    }
}
