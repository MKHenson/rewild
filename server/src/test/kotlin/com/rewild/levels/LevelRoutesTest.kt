package com.rewild.levels

import com.rewild.installTestAuth
import com.rewild.makeTestJwtService
import com.rewild.startTestDatabase
import com.rewild.auth.JwtService
import com.rewild.models.*
import com.rewild.projects.ProjectService
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals

class LevelRoutesTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var jwtService: JwtService
        private lateinit var service: LevelService
        private lateinit var projectService: ProjectService
        private val json = Json { ignoreUnknownKeys = true }

        const val USER_A = "level-user-a"
        const val USER_B = "level-user-b"
        const val PROJECT_A = "level-fixture-proj-a"
        const val PROJECT_B = "level-fixture-proj-b"

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            jwtService = makeTestJwtService()
            service = LevelService()
            projectService = ProjectService()

            projectService.upsert(USER_A, makeProject(PROJECT_A))
            projectService.upsert(USER_B, makeProject(PROJECT_B))
        }

        @AfterClass
        @JvmStatic
        fun teardown() {
            postgres.close()
        }

        private fun makeAtmosphere() = Atmosphere(
            elevation = JsonPrimitive(0.0),
            cloudiness = JsonPrimitive(0.0),
            foginess = JsonPrimitive(0.0),
            windiness = JsonPrimitive(0.0),
            precipitation = JsonPrimitive(0.0),
            temperature = JsonPrimitive(20.0),
            dayNightCycle = JsonPrimitive(true)
        )

        private fun makeProject(id: String) = Project(
            id = id,
            userId = "placeholder",
            levelId = null,
            name = "Fixture Project",
            description = "",
            activeOnStartup = false,
            startEvent = "",
            sceneGraph = SceneGraph(containers = emptyList(), atmosphere = makeAtmosphere()),
            updatedAt = 1000L
        )

        private fun makeLevel(id: String, projectId: String, name: String = "Test Level") = Level(
            id = id,
            userId = "placeholder",
            projectId = projectId,
            name = name,
            activeOnStartup = false,
            hasTerrain = false,
            startEvent = "",
            containers = emptyList(),
            updatedAt = 1000L
        )
    }

    private fun ApplicationTestBuilder.installTestApp() {
        installTestAuth(jwtService) { levelRoutes(service) }
    }

    @Test
    fun `request without token returns 401`() = testApplication {
        installTestApp()
        val response = client.get("/api/levels")
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun `GET levels returns only authenticated user records`() = testApplication {
        installTestApp()
        val listUserId = "level-list-user"
        val listProjectId = "level-list-proj"
        projectService.upsert(listUserId, makeProject(listProjectId))
        service.upsert(listUserId, makeLevel("list-level-1", listProjectId))
        service.upsert(USER_B, makeLevel("list-level-2", PROJECT_B))

        val token = jwtService.generateToken(listUserId, "$listUserId@test.com")
        val response = client.get("/api/levels") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val levels = json.decodeFromString<List<Level>>(response.bodyAsText())
        assertEquals(1, levels.size)
        assertEquals("list-level-1", levels[0].id)
    }

    @Test
    fun `GET level by id returns own record`() = testApplication {
        installTestApp()
        service.upsert(USER_A, makeLevel("get-own-level", PROJECT_A))

        val token = jwtService.generateToken(USER_A, "$USER_A@test.com")
        val response = client.get("/api/levels/get-own-level") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val level = json.decodeFromString<Level>(response.bodyAsText())
        assertEquals("get-own-level", level.id)
    }

    @Test
    fun `GET level by id for other user returns 404`() = testApplication {
        installTestApp()
        service.upsert(USER_A, makeLevel("other-user-level", PROJECT_A))

        val token = jwtService.generateToken(USER_B, "$USER_B@test.com")
        val response = client.get("/api/levels/other-user-level") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `GET level by id for missing record returns 404`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken(USER_A, "$USER_A@test.com")
        val response = client.get("/api/levels/does-not-exist-level") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `PUT level creates new record`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken(USER_A, "$USER_A@test.com")
        val level = makeLevel("put-create-level", PROJECT_A, "Created via PUT")

        val response = client.put("/api/levels/put-create-level") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(level))
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val returned = json.decodeFromString<Level>(response.bodyAsText())
        assertEquals("put-create-level", returned.id)
        assertEquals(USER_A, returned.userId)
        assertEquals("Created via PUT", returned.name)
    }

    @Test
    fun `PUT level updates existing record`() = testApplication {
        installTestApp()
        service.upsert(USER_A, makeLevel("put-update-level", PROJECT_A, "Original"))

        val token = jwtService.generateToken(USER_A, "$USER_A@test.com")
        val updated = makeLevel("put-update-level", PROJECT_A, "Updated")

        val response = client.put("/api/levels/put-update-level") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(updated))
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val returned = json.decodeFromString<Level>(response.bodyAsText())
        assertEquals("Updated", returned.name)
    }

    @Test
    fun `PUT level with id owned by another user returns 403`() = testApplication {
        installTestApp()
        service.upsert(USER_A, makeLevel("owned-level", PROJECT_A))

        val token = jwtService.generateToken(USER_B, "$USER_B@test.com")
        val response = client.put("/api/levels/owned-level") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(makeLevel("owned-level", PROJECT_B)))
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
    }

    @Test
    fun `DELETE level removes own record`() = testApplication {
        installTestApp()
        service.upsert(USER_A, makeLevel("delete-me-level", PROJECT_A))

        val token = jwtService.generateToken(USER_A, "$USER_A@test.com")
        val response = client.delete("/api/levels/delete-me-level") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.NoContent, response.status)

        val getResponse = client.get("/api/levels/delete-me-level") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.NotFound, getResponse.status)
    }

    @Test
    fun `DELETE level owned by another user returns 403`() = testApplication {
        installTestApp()
        service.upsert(USER_A, makeLevel("del-other-level", PROJECT_A))

        val token = jwtService.generateToken(USER_B, "$USER_B@test.com")
        val response = client.delete("/api/levels/del-other-level") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
    }

    @Test
    fun `DELETE missing level returns 404`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken(USER_A, "$USER_A@test.com")
        val response = client.delete("/api/levels/no-such-level") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `PUT uses path id not body id`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken(USER_A, "$USER_A@test.com")
        val level = makeLevel("level-body-id-ignored", PROJECT_A)

        val response = client.put("/api/levels/level-path-id-wins") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(level))
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val returned = json.decodeFromString<Level>(response.bodyAsText())
        assertEquals("level-path-id-wins", returned.id)
    }
}
