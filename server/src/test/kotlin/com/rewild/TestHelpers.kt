package com.rewild

import com.rewild.auth.JwtService
import com.rewild.common.ErrorResponse
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.sql.Database

fun startTestDatabase(): EmbeddedPostgres {
    val postgres = EmbeddedPostgres.start()
    Flyway.configure()
        .dataSource(postgres.getJdbcUrl("postgres", "postgres"), "postgres", "")
        .load()
        .migrate()
    val hikari = HikariConfig().apply {
        jdbcUrl = postgres.getJdbcUrl("postgres", "postgres")
        username = "postgres"
        password = ""
        driverClassName = "org.postgresql.Driver"
        maximumPoolSize = 5
    }
    Database.connect(HikariDataSource(hikari))
    return postgres
}

fun makeTestJwtService() = JwtService("test-secret-1234567890", "http://localhost", "rewild-api")

fun ApplicationTestBuilder.installTestAuth(jwtService: JwtService, routes: Route.() -> Unit) {
    application {
        install(ContentNegotiation) { json() }
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
        routing {
            route("/api") {
                authenticate("auth-jwt") {
                    routes()
                }
            }
        }
    }
}
