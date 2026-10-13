package com.rewild.publicgame

import com.rewild.admin.SuperAdminGuard
import com.rewild.common.ErrorResponse
import com.rewild.models.PublicGame
import com.rewild.models.SetPublicGameRequest
import io.github.smiley4.ktoropenapi.get
import io.github.smiley4.ktoropenapi.put
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

private suspend fun ApplicationCall.respondPublicGame(game: PublicGame?) =
    if (game == null) respond(HttpStatusCode.NoContent) else respond(game)

/** Open to everyone, also logged out players. */
fun Route.publicGameRoutes(service: PublicGameService) {
    route("/public-game") {
        get({
            tags("Public Game")
            summary = "Get the public game"
            description = "Returns the summary of the project promoted to Story Mode. No auth"
            response {
                code(HttpStatusCode.OK) { body<PublicGame>() }
                code(HttpStatusCode.NoContent) { description = "No project is promoted" }
            }
        }) {
            call.respondPublicGame(service.get())
        }
    }
}

/** Must sit inside an authenticated route. */
fun Route.publicGameAdminRoutes(service: PublicGameService, isSuperAdmin: (String) -> Boolean) {
    route("/public-game") {
        install(SuperAdminGuard) { this.isSuperAdmin = isSuperAdmin }

        put({
            tags("Public Game")
            summary = "Set the public game"
            description = "Promotes a project saved on the server to Story Mode, or clears the promotion with a null projectId. Super admin only."
            request { body<SetPublicGameRequest>() }
            response {
                code(HttpStatusCode.OK) { body<PublicGame>() }
                code(HttpStatusCode.NoContent) { description = "The promotion is cleared" }
                code(HttpStatusCode.BadRequest) { body<ErrorResponse>() }
                code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
            }
        }) {
            val req = call.receive<SetPublicGameRequest>()
            when (val result = service.set(req.projectId)) {
                is SetPublicGameResult.Success -> call.respondPublicGame(result.game)
                is SetPublicGameResult.Invalid -> call.respond(HttpStatusCode.BadRequest, ErrorResponse(result.message))
            }
        }
    }
}
