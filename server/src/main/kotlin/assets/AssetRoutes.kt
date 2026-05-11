package com.rewild.assets

import com.rewild.common.ErrorResponse
import com.rewild.common.userId
import com.rewild.models.Asset
import com.rewild.models.ConfirmRequest
import com.rewild.models.UploadUrlRequest
import com.rewild.models.UploadUrlResponse
import io.github.smiley4.ktoropenapi.get
import io.github.smiley4.ktoropenapi.post
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.assetRoutes(service: AssetService) {
    route("/assets") {
        get({
            tags("Assets")
            summary = "List assets"
            description = "Returns all confirmed assets for the authenticated user"
            response {
                code(HttpStatusCode.OK) { body<List<Asset>>() }
            }
        }) {
            call.respond(service.listConfirmed(call.userId()))
        }

        post("/upload-url", {
            tags("Assets")
            summary = "Request presigned upload URL"
            description = "Validates level ownership and returns a presigned PUT URL for direct upload to object storage"
            request { body<UploadUrlRequest>() }
            response {
                code(HttpStatusCode.OK) { body<UploadUrlResponse>() }
                code(HttpStatusCode.Forbidden) { body<ErrorResponse>() }
            }
        }) {
            val req = call.receive<UploadUrlRequest>()
            val result = service.requestUploadUrl(call.userId(), req.levelId, req.assetType, req.filename)
                ?: return@post call.respond(HttpStatusCode.Forbidden, ErrorResponse("Level not found or not owned by user"))
            call.respond(result)
        }

        post("/confirm", {
            tags("Assets")
            summary = "Confirm asset upload"
            description = "Marks an asset as confirmed after successful direct upload. Purges stale unconfirmed records older than 1 hour."
            request { body<ConfirmRequest>() }
            response {
                code(HttpStatusCode.NoContent) { description = "Confirmed" }
                code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
            }
        }) {
            val req = call.receive<ConfirmRequest>()
            val confirmed = service.confirmUpload(call.userId(), req.storageKey)
            if (!confirmed) return@post call.respond(HttpStatusCode.NotFound, ErrorResponse("Asset not found"))
            call.respond(HttpStatusCode.NoContent)
        }
    }
}
