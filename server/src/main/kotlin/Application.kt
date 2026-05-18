package com.rewild

import com.rewild.assets.AssetService
import com.rewild.assets.S3Client
import com.rewild.assets.assetRoutes
import com.rewild.auth.*
import com.rewild.email.EmailService
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
import io.ktor.server.plugins.cors.routing.*
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
    val emailService = EmailService(
        host = config.propertyOrNull("email.host")?.getString() ?: "smtp.tem.scw.cloud",
        port = config.propertyOrNull("email.port")?.getString()?.toIntOrNull() ?: 465,
        username = config.propertyOrNull("email.username")?.getString() ?: "",
        password = config.propertyOrNull("email.password")?.getString() ?: "",
        from = config.propertyOrNull("email.from")?.getString() ?: "noreply@paintedpolygons.com",
    )
    val appUrl = config.propertyOrNull("email.appUrl")?.getString() ?: "https://paintedpolygons.com"
    val authService = AuthService(jwtService, emailService, appUrl)
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

    fun str(key: String) = environment.config.propertyOrNull(key)?.getString() ?: ""
    val s3Endpoint = str("storage.s3Endpoint")
    val s3 = if (s3Endpoint.isNotEmpty()) S3Client(
        endpoint = s3Endpoint,
        accessKey = str("storage.s3AccessKey"),
        secretKey = str("storage.s3SecretKey")
    ) else null
    val assetService = AssetService(
        s3 = s3,
        bucketName = str("storage.bucketName"),
        bucketBaseUrl = str("storage.bucketBaseUrl")
    )

    val corsOrigin = environment.config.propertyOrNull("cors.allowedOrigin")?.getString()
    install(CORS) {
        if (corsOrigin.isNullOrEmpty()) {
            anyHost()
        } else {
            val uri = java.net.URI(corsOrigin)
            allowHost(uri.host, schemes = listOf(uri.scheme))
        }
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Authorization)
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowCredentials = true
    }

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
                    assetRoutes(assetService)
                }
            } else {
                projectRoutes(projectService)
                levelRoutes(levelService)
                syncRoutes(syncService)
                assetRoutes(assetService)
            }
        }
    }
}

