package com.rewild.common

import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*

fun ApplicationCall.userId(): String =
    principal<JWTPrincipal>()!!.payload.getClaim("userId").asString()

fun ApplicationCall.userIdOrNull(): String? =
    principal<JWTPrincipal>()?.payload?.getClaim("userId")?.asString()
