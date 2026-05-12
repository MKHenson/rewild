package com.rewild.auth

import com.rewild.common.ErrorResponse
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import com.rewild.makeTestJwtService
import org.junit.Test
import kotlin.test.assertEquals

class JwtMiddlewareTest {

    private val testJwtService = makeTestJwtService()

    private fun ApplicationTestBuilder.installTestApp() {
        application {
            install(ContentNegotiation) { json() }
            install(Authentication) {
                jwt("auth-jwt") {
                    realm = "rewild-api"
                    verifier(testJwtService.makeVerifier())
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
                authenticate("auth-jwt") {
                    get("/protected") { call.respond(HttpStatusCode.OK, "ok") }
                }
            }
        }
    }

    @Test
    fun `request without token returns 401`() = testApplication {
        installTestApp()
        val response = client.get("/protected")
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun `request with invalid token returns 401`() = testApplication {
        installTestApp()
        val response = client.get("/protected") {
            header(HttpHeaders.Authorization, "Bearer not.a.valid.token")
        }
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun `request with valid token passes through`() = testApplication {
        installTestApp()
        val token = testJwtService.generateToken("user-123", "test@example.com", "user-123")
        val response = client.get("/protected") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
    }

    @Test
    fun `request with tampered token returns 401`() = testApplication {
        installTestApp()
        val token = testJwtService.generateToken("user-123", "test@example.com", "user-123")
        val tampered = token.dropLast(5) + "XXXXX"
        val response = client.get("/protected") {
            header(HttpHeaders.Authorization, "Bearer $tampered")
        }
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }
}
