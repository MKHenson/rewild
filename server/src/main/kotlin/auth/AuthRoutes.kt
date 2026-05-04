package com.rewild.auth

import com.rewild.common.ErrorResponse
import io.github.smiley4.ktoropenapi.post
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

private const val REFRESH_TOKEN_COOKIE = "refresh_token"
private const val REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

fun Route.authRoutes(authService: AuthService, secureCookies: Boolean) {
    route("/auth") {
        route("/register") {
            post({
                tags("Auth")
                summary = "Register"
                description = "Creates a new user account and returns a JWT access token"
                request { body<RegisterRequest>() }
                response {
                    code(HttpStatusCode.Created) { body<AuthResponse>() }
                }
            }) {
                val req = call.receive<RegisterRequest>()
                val tokens = authService.register(req.email, req.password)
                    ?: return@post call.respond(HttpStatusCode.Conflict, ErrorResponse("Email already registered"))
                call.setRefreshCookie(tokens.refreshToken, secureCookies)
                call.respond(HttpStatusCode.Created, AuthResponse(tokens.accessToken))
            }
        }

        route("/login") {
            post({
                tags("Auth")
                summary = "Login"
                description = "Authenticates with email and password and returns a JWT access token"
                request { body<LoginRequest>() }
                response {
                    code(HttpStatusCode.OK) { body<AuthResponse>() }
                }
            }) {
                val req = call.receive<LoginRequest>()
                val tokens = authService.login(req.email, req.password)
                    ?: return@post call.respond(HttpStatusCode.Unauthorized, ErrorResponse("Invalid credentials"))
                call.setRefreshCookie(tokens.refreshToken, secureCookies)
                call.respond(HttpStatusCode.OK, AuthResponse(tokens.accessToken))
            }
        }

        route("/refresh") {
            post({
                tags("Auth")
                summary = "Refresh token"
                description = "Issues a new access token using the refresh token cookie"
                response {
                    code(HttpStatusCode.OK) { body<AuthResponse>() }
                }
            }) {
                val token = call.request.cookies[REFRESH_TOKEN_COOKIE]
                    ?: return@post call.respond(HttpStatusCode.Unauthorized, ErrorResponse("No refresh token"))
                val tokens = authService.refresh(token)
                    ?: return@post call.respond(HttpStatusCode.Unauthorized, ErrorResponse("Refresh token expired or invalid"))
                call.setRefreshCookie(tokens.refreshToken, secureCookies)
                call.respond(HttpStatusCode.OK, AuthResponse(tokens.accessToken))
            }
        }

        route("/logout") {
            post({
                tags("Auth")
                summary = "Logout"
                description = "Revokes the refresh token and clears the auth cookie"
                response {
                    code(HttpStatusCode.NoContent) { description = "Logged out" }
                }
            }) {
                val token = call.request.cookies[REFRESH_TOKEN_COOKIE]
                if (token != null) authService.revoke(token)
                call.clearRefreshCookie(secureCookies)
                call.respond(HttpStatusCode.NoContent)
            }
        }
    }
}

private fun ApplicationCall.setRefreshCookie(token: String, secure: Boolean) {
    response.cookies.append(
        name = REFRESH_TOKEN_COOKIE,
        value = token,
        httpOnly = true,
        secure = secure,
        maxAge = REFRESH_TOKEN_MAX_AGE.toLong(),
        path = "/api/auth",
        extensions = mapOf("SameSite" to "Strict")
    )
}

private fun ApplicationCall.clearRefreshCookie(secure: Boolean) {
    response.cookies.append(
        name = REFRESH_TOKEN_COOKIE,
        value = "",
        httpOnly = true,
        secure = secure,
        maxAge = 0L,
        path = "/api/auth"
    )
}
