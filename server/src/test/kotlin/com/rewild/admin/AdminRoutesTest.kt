package com.rewild.admin

import com.rewild.auth.AuthService
import com.rewild.auth.JwtService
import com.rewild.auth.UserRole
import com.rewild.db.tables.UsersTable
import com.rewild.installTestAuth
import com.rewild.makeTestJwtService
import com.rewild.startTestDatabase
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AdminRoutesTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var jwtService: JwtService
        private lateinit var service: AdminService
        private val json = Json { ignoreUnknownKeys = true }

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            jwtService = makeTestJwtService()
            service = AdminService(AuthService(jwtService))
        }

        @AfterClass
        @JvmStatic
        fun teardown() {
            postgres.close()
        }

        private fun insertUser(id: String, role: String = UserRole.USER) = transaction {
            UsersTable.insert {
                it[UsersTable.id] = id
                it[email] = "$id@test.com"
                it[displayName] = id
                it[UsersTable.role] = role
                it[createdAt] = System.currentTimeMillis()
            }
        }
    }

    private fun ApplicationTestBuilder.installTestApp() {
        installTestAuth(jwtService) { adminRoutes(service) }
    }

    private fun tokenFor(id: String) = jwtService.generateToken(id, "$id@test.com", id)

    @Test
    fun `request without token returns 401`() = testApplication {
        installTestApp()
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/admin/users").status)
    }

    @Test
    fun `regular user is forbidden`() = testApplication {
        installTestApp()
        insertUser("admin-regular")
        val response = client.get("/api/admin/users") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-regular")}")
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
    }

    @Test
    fun `role claim alone does not grant access`() = testApplication {
        installTestApp()
        insertUser("admin-forged")
        val token = jwtService.generateToken("admin-forged", "admin-forged@test.com", "x", role = UserRole.SUPER_ADMIN)
        val response = client.get("/api/admin/users") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
    }

    @Test
    fun `super admin lists users`() = testApplication {
        installTestApp()
        insertUser("admin-lister", UserRole.SUPER_ADMIN)
        insertUser("admin-listed")
        val response = client.get("/api/admin/users") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-lister")}")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val ids = json.decodeFromString<List<UserAccount>>(response.bodyAsText()).map { it.id }
        assertTrue("admin-lister" in ids)
        assertTrue("admin-listed" in ids)
    }

    @Test
    fun `super admin gets unknown user returns 404`() = testApplication {
        installTestApp()
        insertUser("admin-getter", UserRole.SUPER_ADMIN)
        val response = client.get("/api/admin/users/missing") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-getter")}")
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `super admin updates user`() = testApplication {
        installTestApp()
        insertUser("admin-updater", UserRole.SUPER_ADMIN)
        insertUser("admin-updated")
        val response = client.put("/api/admin/users/admin-updated") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-updater")}")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(UpdateUserRequest("Renamed", UserRole.SUPER_ADMIN)))
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val user = json.decodeFromString<UserAccount>(response.bodyAsText())
        assertEquals("Renamed", user.displayName)
        assertEquals(UserRole.SUPER_ADMIN, user.role)
        assertEquals("admin-updated@test.com", user.email)
    }

    @Test
    fun `update rejects unknown role`() = testApplication {
        installTestApp()
        insertUser("admin-bad-role", UserRole.SUPER_ADMIN)
        insertUser("admin-bad-role-target")
        val response = client.put("/api/admin/users/admin-bad-role-target") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-bad-role")}")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(UpdateUserRequest("Name", "owner")))
        }
        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    @Test
    fun `super admin cannot change own role`() = testApplication {
        installTestApp()
        insertUser("admin-self", UserRole.SUPER_ADMIN)
        val response = client.put("/api/admin/users/admin-self") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-self")}")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(UpdateUserRequest("admin-self", UserRole.USER)))
        }
        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    @Test
    fun `password reset for unknown user returns 404`() = testApplication {
        installTestApp()
        insertUser("admin-resetter", UserRole.SUPER_ADMIN)
        val response = client.post("/api/admin/users/missing/password-reset") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-resetter")}")
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `password reset for existing user returns 204`() = testApplication {
        installTestApp()
        insertUser("admin-resetter-2", UserRole.SUPER_ADMIN)
        insertUser("admin-reset-target")
        val response = client.post("/api/admin/users/admin-reset-target/password-reset") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-resetter-2")}")
        }
        assertEquals(HttpStatusCode.NoContent, response.status)
    }
}
