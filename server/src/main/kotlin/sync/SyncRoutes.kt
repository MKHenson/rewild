package com.rewild.sync

import com.rewild.common.ErrorResponse
import com.rewild.common.userId
import com.rewild.models.SyncRequest
import com.rewild.models.SyncResponse
import io.github.smiley4.ktoropenapi.post
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.syncRoutes(syncService: SyncService) {
    route("/sync") {
        post({
            tags("Sync")
            summary = "Sync"
            description = "Bidirectional sync: push dirty local records and pull server-side changes since lastSyncedAt"
            request { body<SyncRequest>() }
            response {
                code(HttpStatusCode.OK) { body<SyncResponse>() }
                code(HttpStatusCode.BadRequest) { body<ErrorResponse>() }
            }
        }) {
            val userId = call.userId()
            val request = try {
                call.receive<SyncRequest>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("Invalid request body"))
                return@post
            }
            call.respond(HttpStatusCode.OK, syncService.sync(userId, request))
        }
    }
}
