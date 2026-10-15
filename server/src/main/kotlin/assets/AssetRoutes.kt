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
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

private suspend inline fun <reified T : Any> ApplicationCall.respondAssetResult(result: AssetResult<T>) = when (result) {
    is AssetResult.Success -> respond(result.value)
    is AssetResult.Invalid -> respond(HttpStatusCode.BadRequest, ErrorResponse(result.message))
    AssetResult.NotFound -> respond(HttpStatusCode.NotFound, ErrorResponse("Not found"))
    AssetResult.Unavailable -> respond(HttpStatusCode.ServiceUnavailable, ErrorResponse("File storage is not configured"))
}

fun Route.assetRoutes(service: AssetService) {
    route("/assets") {
        get({
            tags("Assets")
            summary = "List assets"
            description = "Returns the confirmed files of the caller's live projects and levels"
            response {
                code(HttpStatusCode.OK) { body<List<Asset>>() }
            }
        }) {
            call.respond(service.listConfirmed(call.userId()))
        }

        post("/upload-url", {
            tags("Assets")
            summary = "Request presigned upload URL"
            description = "Owner only. Checks the file against its asset type's rule (scope, filename, content type and size) and returns a presigned PUT URL. The upload must send the requested Content-Type"
            request { body<UploadUrlRequest>() }
            response {
                code(HttpStatusCode.OK) { body<UploadUrlResponse>() }
                code(HttpStatusCode.BadRequest) { body<ErrorResponse>() }
                code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
                code(HttpStatusCode.ServiceUnavailable) { body<ErrorResponse>() }
            }
        }) {
            call.respondAssetResult(service.requestUploadUrl(call.userId(), call.receive<UploadUrlRequest>()))
        }

        post("/confirm", {
            tags("Assets")
            summary = "Confirm asset upload"
            description = "Checks the uploaded object against its asset type's rule and makes it the file's new version. Purges uploads never confirmed within 1 hour"
            request { body<ConfirmRequest>() }
            response {
                code(HttpStatusCode.OK) { body<Asset>() }
                code(HttpStatusCode.BadRequest) { body<ErrorResponse>() }
                code(HttpStatusCode.NotFound) { body<ErrorResponse>() }
            }
        }) {
            call.respondAssetResult(service.confirmUpload(call.userId(), call.receive<ConfirmRequest>().storageKey))
        }
    }
}
