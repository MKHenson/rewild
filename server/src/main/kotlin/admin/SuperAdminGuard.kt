package com.rewild.admin

import com.rewild.common.ErrorResponse
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.response.*

class SuperAdminGuardConfig {
    var isSuperAdmin: (userId: String) -> Boolean = { false }
}

/** Rejects with 403 any call on the route whose authenticated user is not a super admin. */
val SuperAdminGuard = createRouteScopedPlugin("SuperAdminGuard", ::SuperAdminGuardConfig) {
    val isSuperAdmin = pluginConfig.isSuperAdmin

    on(AuthenticationChecked) { call ->
        if (call.isHandled) return@on
        val userId = call.principal<JWTPrincipal>()?.payload?.getClaim("userId")?.asString()
        if (userId == null || !isSuperAdmin(userId)) {
            call.respond(HttpStatusCode.Forbidden, ErrorResponse("Forbidden"))
        }
    }
}
