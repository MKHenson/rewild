package com.rewild.publicgame

import com.rewild.admin.AdminService
import com.rewild.auth.AuthService
import com.rewild.auth.JwtService
import com.rewild.auth.UserRole
import com.rewild.common.ErrorResponse
import com.rewild.db.tables.UsersTable
import com.rewild.installTestAuth
import com.rewild.makeTestJwtService
import com.rewild.models.Atmosphere
import com.rewild.models.Project
import com.rewild.models.PublicGame
import com.rewild.models.SceneGraph
import com.rewild.models.SetPublicGameRequest
import com.rewild.projects.ProjectService
import com.rewild.projects.projectRoutes
import com.rewild.projects.ProjectImageService
import com.rewild.startTestDatabase
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.AfterClass
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PublicGameRoutesTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var jwtService: JwtService
        private lateinit var service: PublicGameService
        private lateinit var adminService: AdminService
        private lateinit var projectService: ProjectService
        private const val BASE_URL = "https://fake-s3/public"
        private const val ADMIN = "pg-admin"
        private const val OWNER = "pg-owner"
        private val json = Json { ignoreUnknownKeys = true }

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            jwtService = makeTestJwtService()
            service = PublicGameService(BASE_URL)
            adminService = AdminService(AuthService(jwtService))
            projectService = ProjectService(bucketBaseUrl = BASE_URL)
            insertUser(ADMIN, UserRole.SUPER_ADMIN)
            insertUser(OWNER)
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

        private fun makeProject(id: String) = Project(
            id = id,
            name = "Story $id",
            description = "About $id",
            startEvent = "",
            sceneGraph = SceneGraph(
                containers = emptyList(),
                atmosphere = Atmosphere(
                    elevation = JsonPrimitive(0.0),
                    cloudiness = JsonPrimitive(0.0),
                    foginess = JsonPrimitive(0.0),
                    windiness = JsonPrimitive(0.0),
                    precipitation = JsonPrimitive(0.0),
                    temperature = JsonPrimitive(20.0),
                    dayNightCycle = JsonPrimitive(true)
                )
            ),
            updatedAt = 1000L
        )
    }

    @Before
    fun clearPromotion() {
        service.set(null)
    }

    private fun ApplicationTestBuilder.installTestApp() {
        installTestAuth(jwtService) {
            projectRoutes(projectService, ProjectImageService(null, null, "test-bucket", BASE_URL))
            publicGameAdminRoutes(service, adminService::isSuperAdmin)
        }
        routing { route("/api") { publicGameRoutes(service) } }
    }

    private fun tokenFor(id: String) = jwtService.generateToken(id, "$id@test.com", id)

    private suspend fun ApplicationTestBuilder.promote(projectId: String?, as_: String = ADMIN) =
        client.put("/api/public-game") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor(as_)}")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SetPublicGameRequest(projectId)))
        }

    @Test
    fun `GET without a promoted project returns 204`() = testApplication {
        installTestApp()
        assertEquals(HttpStatusCode.NoContent, client.get("/api/public-game").status)
    }

    @Test
    fun `admin promotes a project and a logged out request gets only its summary`() = testApplication {
        installTestApp()
        projectService.upsert(OWNER, makeProject("pg-promoted"))

        val put = promote("pg-promoted")
        assertEquals(HttpStatusCode.OK, put.status)

        val response = client.get("/api/public-game")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals(setOf("id", "name", "description", "imageUrl"), body.keys)
        assertEquals(
            PublicGame("pg-promoted", "Story pg-promoted", "About pg-promoted"),
            json.decodeFromString<PublicGame>(response.bodyAsText())
        )
    }

    @Test
    fun `admin clears the promotion`() = testApplication {
        installTestApp()
        projectService.upsert(OWNER, makeProject("pg-cleared"))
        promote("pg-cleared")

        assertEquals(HttpStatusCode.NoContent, promote(null).status)
        assertEquals(HttpStatusCode.NoContent, client.get("/api/public-game").status)
    }

    @Test
    fun `PUT rejects a project that is not saved on the server`() = testApplication {
        installTestApp()
        val response = promote("pg-local-only")
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertEquals("The project is not saved on the server", json.decodeFromString<ErrorResponse>(response.bodyAsText()).error)
        assertNull(service.get())
    }

    @Test
    fun `PUT is super admin only`() = testApplication {
        installTestApp()
        projectService.upsert(OWNER, makeProject("pg-self-promoted"))

        assertEquals(HttpStatusCode.Forbidden, promote("pg-self-promoted", as_ = OWNER).status)
        val anonymous = client.put("/api/public-game") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SetPublicGameRequest("pg-self-promoted")))
        }
        assertEquals(HttpStatusCode.Unauthorized, anonymous.status)
        assertNull(service.get())
    }

    @Test
    fun `the public project cannot be deleted`() = testApplication {
        installTestApp()
        projectService.upsert(OWNER, makeProject("pg-undeletable"))
        promote("pg-undeletable")

        val response = client.delete("/api/projects/pg-undeletable") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor(OWNER)}")
        }
        assertEquals(HttpStatusCode.Conflict, response.status)
        assertEquals("pg-undeletable", service.get()?.id)

        promote(null)
        val retry = client.delete("/api/projects/pg-undeletable") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor(OWNER)}")
        }
        assertEquals(HttpStatusCode.NoContent, retry.status)
    }
}
