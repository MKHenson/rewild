package com.rewild.projects

import com.rewild.installTestAuth
import com.rewild.makeTestJwtService
import com.rewild.startTestDatabase
import com.rewild.auth.JwtService
import com.rewild.models.Atmosphere
import com.rewild.models.Project
import com.rewild.models.SceneGraph
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
import kotlin.test.assertNotNull

class ProjectRoutesTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var jwtService: JwtService
        private lateinit var service: ProjectService
        private val json = Json { ignoreUnknownKeys = true }

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            jwtService = makeTestJwtService()
            service = ProjectService()
        }

        @AfterClass
        @JvmStatic
        fun teardown() {
            postgres.close()
        }

        private fun makeProject(id: String, name: String = "Test Project") = Project(
            id = id,
            userId = "placeholder",
            levelId = null,
            name = name,
            description = "A test project",
            activeOnStartup = false,
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

    private fun ApplicationTestBuilder.installTestApp() {
        installTestAuth(jwtService) { projectRoutes(service) }
    }

    @Test
    fun `request without token returns 401`() = testApplication {
        installTestApp()
        val response = client.get("/api/projects")
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun `GET projects returns only authenticated user records`() = testApplication {
        installTestApp()
        val userId = "user-list-proj"
        service.upsert(userId, makeProject("list-proj-1"))
        service.upsert("other-user", makeProject("list-proj-2"))

        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val response = client.get("/api/projects") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val projects = json.decodeFromString<List<Project>>(response.bodyAsText())
        assertEquals(1, projects.size)
        assertEquals("list-proj-1", projects[0].id)
    }

    @Test
    fun `GET project by id returns own record`() = testApplication {
        installTestApp()
        service.upsert("user-get-own", makeProject("get-own-proj"))

        val token = jwtService.generateToken("user-get-own", "user-get-own@test.com", "user-get-own")
        val response = client.get("/api/projects/get-own-proj") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val project = json.decodeFromString<Project>(response.bodyAsText())
        assertEquals("get-own-proj", project.id)
    }

    @Test
    fun `GET project by id for other user returns 404`() = testApplication {
        installTestApp()
        service.upsert("user-owner", makeProject("other-user-proj"))

        val token = jwtService.generateToken("user-not-owner", "notowner@test.com", "user-not-owner")
        val response = client.get("/api/projects/other-user-proj") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `GET project by id for missing record returns 404`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken("user-any", "user-any@test.com", "user-any")
        val response = client.get("/api/projects/does-not-exist") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `PUT project creates new record`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken("user-put-create", "user-put-create@test.com", "user-put-create")
        val project = makeProject("put-create-proj", "Created via PUT")

        val response = client.put("/api/projects/put-create-proj") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(project))
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val returned = json.decodeFromString<Project>(response.bodyAsText())
        assertEquals("put-create-proj", returned.id)
        assertEquals("user-put-create", returned.userId)
        assertEquals("Created via PUT", returned.name)
    }

    @Test
    fun `PUT project updates existing record`() = testApplication {
        installTestApp()
        val userId = "user-put-update"
        service.upsert(userId, makeProject("put-update-proj", "Original"))

        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val updated = makeProject("put-update-proj", "Updated")

        val response = client.put("/api/projects/put-update-proj") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(updated))
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val returned = json.decodeFromString<Project>(response.bodyAsText())
        assertEquals("Updated", returned.name)
    }

    @Test
    fun `PUT project with id owned by another user returns 403`() = testApplication {
        installTestApp()
        service.upsert("user-proj-owner", makeProject("owned-proj"))

        val token = jwtService.generateToken("user-proj-intruder", "intruder@test.com", "user-proj-intruder")
        val response = client.put("/api/projects/owned-proj") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(makeProject("owned-proj")))
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
    }

    @Test
    fun `DELETE project removes own record`() = testApplication {
        installTestApp()
        val userId = "user-delete-proj"
        service.upsert(userId, makeProject("delete-me-proj"))

        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val response = client.delete("/api/projects/delete-me-proj") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.NoContent, response.status)

        val getResponse = client.get("/api/projects/delete-me-proj") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.NotFound, getResponse.status)
    }

    @Test
    fun `DELETE project owned by another user returns 403`() = testApplication {
        installTestApp()
        service.upsert("user-del-owner", makeProject("del-other-proj"))

        val token = jwtService.generateToken("user-del-intruder", "delintruder@test.com", "user-del-intruder")
        val response = client.delete("/api/projects/del-other-proj") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
    }

    @Test
    fun `DELETE missing project returns 404`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken("user-del-missing", "delmissing@test.com", "user-del-missing")
        val response = client.delete("/api/projects/no-such-proj") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `PUT uses path id not body id`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken("user-id-check", "idcheck@test.com", "user-id-check")
        val project = makeProject("body-id-ignored")

        val response = client.put("/api/projects/path-id-wins") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(project))
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val returned = json.decodeFromString<Project>(response.bodyAsText())
        assertEquals("path-id-wins", returned.id)
    }
}
