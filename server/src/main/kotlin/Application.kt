package com.rewild

import com.rewild.auth.*
import com.rewild.common.ErrorResponse
import com.rewild.db.DatabaseFactory
import com.rewild.levels.LevelService
import com.rewild.levels.levelRoutes
import com.rewild.models.*
import com.rewild.projects.ProjectService
import com.rewild.projects.projectRoutes
import com.rewild.sync.SyncService
import com.rewild.sync.syncRoutes
import io.github.smiley4.ktoropenapi.OpenApi
import io.github.smiley4.ktoropenapi.openApi
import io.github.smiley4.ktoropenapi.post
import io.github.smiley4.ktoropenapi.route
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.module() {
    DatabaseFactory.init(this)
    val config = environment.config
    val jwtService = JwtService(
        secret = config.property("jwt.secret").getString(),
        issuer = config.property("jwt.issuer").getString(),
        audience = config.property("jwt.audience").getString()
    )
    val authService = AuthService(jwtService)
    val secureCookies = config.propertyOrNull("cookies.secure")?.getString()?.toBoolean() ?: true

    configureAuth(jwtService)
    configureApi(authService, secureCookies, protected = true)
}

// Used by GenerateSpec — no database, just routing for spec generation
fun Application.specModule() {
    val jwtService = JwtService(secret = "spec", issuer = "spec", audience = "spec")
    val authService = AuthService(jwtService)
    configureApi(authService, secureCookies = false, protected = false)
}

private fun Application.configureAuth(jwtService: JwtService) {
    install(Authentication) {
        jwt("auth-jwt") {
            realm = "rewild-api"
            verifier(jwtService.makeVerifier())
            validate { credential ->
                if (credential.payload.getClaim("userId").asString() != null)
                    JWTPrincipal(credential.payload)
                else null
            }
            challenge { _, _ ->
                call.respond(HttpStatusCode.Unauthorized, ErrorResponse("Token is invalid or expired"))
            }
        }
    }
}

private fun Application.configureApi(authService: AuthService, secureCookies: Boolean, protected: Boolean) {
    val projectService = ProjectService()
    val levelService = LevelService()
    val syncService = SyncService(projectService, levelService)

    install(ContentNegotiation) { json() }

    install(OpenApi) {
        info {
            title = "RE-WILD API"
            version = "0.0.1"
            description = "Mycelium — offline-first sync backend for RE-WILD"
        }
    }

    routing {
        route("/openapi.json") { openApi() }

        get("/health") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "ok"))
        }

        route("/api") {
            authRoutes(authService, secureCookies)

            if (protected) {
                authenticate("auth-jwt") {
                    projectRoutes(projectService)
                    levelRoutes(levelService)
                    syncRoutes(syncService)
                }
            } else {
                projectRoutes(projectService)
                levelRoutes(levelService)
                syncRoutes(syncService)
            }
        }
    }
}

