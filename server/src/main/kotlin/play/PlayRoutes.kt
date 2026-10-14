package com.rewild.play

import com.rewild.common.ErrorResponse
import com.rewild.common.userIdOrNull
import com.rewild.models.PlayProject
import io.github.smiley4.ktoropenapi.get
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

/** Must sit inside an optional authenticated route, so logged out players can play the public game. */
fun Route.playRoutes(service: PlayService) {
    route("/play/{projectId}") {
        get({
            tags("Play")
            summary = "Load a project to play"
            description = "Returns the project, its levels and their files. Auth is optional. Allowed for the public game, the owner and super admins. Everyone else gets 404. A flagged project gets 403 for everyone but the owner and super admins"
            request { pathParameter<String>("projectId") { description = "Project ID" } }
            response {
                code(HttpStatusCode.OK) { body<PlayProject>() }
                code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
            }
        }) {
            when (val result = service.load(call.userIdOrNull(), call.parameters["projectId"]!!)) {
                is PlayResult.Success -> call.respond(result.data)
                PlayResult.NotFound -> call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
                PlayResult.Flagged -> call.respond(
                    HttpStatusCode.Forbidden,
                    ErrorResponse("This game is not available. Contact an admin if you think this is a mistake")
                )
            }
        }
    }
}
