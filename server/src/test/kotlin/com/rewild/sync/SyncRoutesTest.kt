package com.rewild.sync

import com.rewild.auth.JwtService
import com.rewild.installTestAuth
import com.rewild.levels.LevelService
import com.rewild.makeTestJwtService
import com.rewild.models.*
import com.rewild.projects.ProjectService
import com.rewild.projects.projectRoutes
import com.rewild.startTestDatabase
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class SyncRoutesTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var jwtService: JwtService
        private lateinit var projectService: ProjectService
        private lateinit var levelService: LevelService
        private lateinit var syncService: SyncService
        private val json = Json { ignoreUnknownKeys = true }

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            jwtService = makeTestJwtService()
            projectService = ProjectService()
            levelService = LevelService()
            syncService = SyncService(projectService, levelService)
        }

        @AfterClass
        @JvmStatic
        fun teardown() {
            postgres.close()
        }

        private fun makeProject(id: String, updatedAt: Long = 1000L, name: String = "Test Project") = Project(
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
            updatedAt = updatedAt
        )

        private fun makeLevel(id: String, updatedAt: Long = 1000L) = Level(
            id = id,
            userId = "placeholder",
            projectId = "proj-1",
            name = "Test Level",
            activeOnStartup = false,
            hasTerrain = false,
            startEvent = "",
            containers = emptyList(),
            updatedAt = updatedAt
        )

        private fun Project.toSyncRecord() = SyncRecord(
            collection = "projects",
            id = id,
            updatedAt = updatedAt,
            data = json.encodeToJsonElement(this).jsonObject
        )

        private fun Level.toSyncRecord() = SyncRecord(
            collection = "levels",
            id = id,
            updatedAt = updatedAt,
            data = json.encodeToJsonElement(this).jsonObject
        )
    }

    private fun ApplicationTestBuilder.installTestApp() {
        installTestAuth(jwtService) {
            syncRoutes(syncService)
            projectRoutes(projectService)
        }
    }

    @Test
    fun `request without token returns 401`() = testApplication {
        installTestApp()
        val response = client.post("/api/sync") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(lastSyncedAt = 0, records = emptyList())))
        }
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun `empty sync returns 200 with syncedAt and no records`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken("user-empty-sync", "user-empty-sync@test.com", "user-empty-sync")
        val response = client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(lastSyncedAt = 0, records = emptyList())))
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = json.decodeFromString<SyncResponse>(response.bodyAsText())
        assertTrue(body.syncedAt > 0)
        assertEquals(0, body.records.size)
    }

    @Test
    fun `upserts incoming project when server has no existing record`() = testApplication {
        installTestApp()
        val userId = "user-push-new"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)

        client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(lastSyncedAt = 0, records = listOf(makeProject("push-new-proj").toSyncRecord()))))
        }

        assertNotNull(projectService.getById(userId, "push-new-proj"))
    }

    @Test
    fun `skips incoming record when server version is newer`() = testApplication {
        installTestApp()
        val userId = "user-server-newer"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        projectService.upsert(userId, makeProject("server-newer-proj", updatedAt = 5000L, name = "ServerVersion"))

        client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(
                lastSyncedAt = 0,
                records = listOf(makeProject("server-newer-proj", updatedAt = 3000L, name = "OlderClient").toSyncRecord())
            )))
        }

        assertEquals("ServerVersion", projectService.getById(userId, "server-newer-proj")?.name)
    }

    @Test
    fun `upserts incoming record when client version is newer`() = testApplication {
        installTestApp()
        val userId = "user-client-newer"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        projectService.upsert(userId, makeProject("client-newer-proj", updatedAt = 1000L, name = "OldServer"))

        client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(
                lastSyncedAt = 0,
                records = listOf(makeProject("client-newer-proj", updatedAt = 9000L, name = "NewerClient").toSyncRecord())
            )))
        }

        assertEquals("NewerClient", projectService.getById(userId, "client-newer-proj")?.name)
    }

    @Test
    fun `overwrites userId from JWT regardless of value in record body`() = testApplication {
        installTestApp()
        val userId = "user-jwt-owns"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val project = makeProject("jwt-owned-proj").copy(userId = "attacker-id")

        client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(lastSyncedAt = 0, records = listOf(project.toSyncRecord()))))
        }

        val stored = projectService.getById(userId, "jwt-owned-proj")
        assertNotNull(stored)
        assertEquals(userId, stored.userId)
    }

    @Test
    fun `lastSyncedAt 0 returns full dataset for user`() = testApplication {
        installTestApp()
        val userId = "user-full-pull"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        projectService.upsert(userId, makeProject("full-pull-1", updatedAt = 1000L))
        projectService.upsert(userId, makeProject("full-pull-2", updatedAt = 2000L))
        projectService.upsert("other-user", makeProject("full-pull-other", updatedAt = 1000L))

        val response = client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(lastSyncedAt = 0, records = emptyList())))
        }

        val body = json.decodeFromString<SyncResponse>(response.bodyAsText())
        val ids = body.records.filter { it.collection == "projects" }.map { it.id }
        assertEquals(2, ids.size)
        assertTrue("full-pull-1" in ids)
        assertTrue("full-pull-2" in ids)
    }

    @Test
    fun `returns only records newer than lastSyncedAt`() = testApplication {
        installTestApp()
        val userId = "user-partial-pull"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        projectService.upsert(userId, makeProject("partial-old", updatedAt = 1000L))
        projectService.upsert(userId, makeProject("partial-new", updatedAt = 5000L))

        val response = client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(lastSyncedAt = 3000, records = emptyList())))
        }

        val body = json.decodeFromString<SyncResponse>(response.bodyAsText())
        val ids = body.records.filter { it.collection == "projects" }.map { it.id }
        assertEquals(1, ids.size)
        assertEquals("partial-new", ids[0])
    }

    @Test
    fun `handles projects and levels in a single request`() = testApplication {
        installTestApp()
        val userId = "user-mixed"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)

        client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(
                lastSyncedAt = 0,
                records = listOf(makeProject("mixed-proj").toSyncRecord(), makeLevel("mixed-level").copy(projectId = "mixed-proj").toSyncRecord())
            )))
        }

        assertNotNull(projectService.getById(userId, "mixed-proj"))
        assertNotNull(levelService.getById(userId, "mixed-level"))
    }

    @Test
    fun `response includes syncedAt timestamp`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken("user-ts", "user-ts@test.com", "user-ts")
        val before = System.currentTimeMillis()

        val response = client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(lastSyncedAt = 0, records = emptyList())))
        }

        val after = System.currentTimeMillis()
        val body = json.decodeFromString<SyncResponse>(response.bodyAsText())
        assertTrue(body.syncedAt in before..after)
    }

    @Test
    fun `sets syncedAt on upserted records`() = testApplication {
        installTestApp()
        val userId = "user-syncedAt-set"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val before = System.currentTimeMillis()

        client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(
                lastSyncedAt = 0,
                records = listOf(makeProject("synced-at-proj").toSyncRecord())
            )))
        }

        val after = System.currentTimeMillis()
        val stored = projectService.getById(userId, "synced-at-proj")
        assertNotNull(stored)
        assertTrue(stored.syncedAt in before..after)
    }

    @Test
    fun `syncing new project with levelId and level together sets levelId correctly`() = testApplication {
        installTestApp()
        val userId = "user-circular-fk"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)

        // Project first in the request — the original failing order.
        val project = makeProject("circular-proj").copy(levelId = "circular-level")
        val level = makeLevel("circular-level").copy(projectId = "circular-proj")

        val response = client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(
                lastSyncedAt = 0,
                records = listOf(project.toSyncRecord(), level.toSyncRecord())
            )))
        }

        assertEquals(HttpStatusCode.OK, response.status)
        val storedProject = projectService.getById(userId, "circular-proj")
        val storedLevel = levelService.getById(userId, "circular-level")
        assertNotNull(storedProject)
        assertNotNull(storedLevel)
        assertEquals("circular-level", storedProject.levelId)
    }

    @Test
    fun `syncing a tombstone project stores deletedAt on server`() = testApplication {
        installTestApp()
        val userId = "user-tombstone-push"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val deletedAt = System.currentTimeMillis()
        val project = makeProject("tombstone-push-proj", updatedAt = deletedAt).copy(deletedAt = deletedAt)

        client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(lastSyncedAt = 0, records = listOf(project.toSyncRecord()))))
        }

        val all = projectService.getAllNewerThan(userId, 0)
        val stored = all.find { it.id == "tombstone-push-proj" }
        assertNotNull(stored)
        assertEquals(deletedAt, stored.deletedAt)
    }

    @Test
    fun `tombstone is included in pull response so clients can remove it`() = testApplication {
        installTestApp()
        val userId = "user-tombstone-pull"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val deletedAt = System.currentTimeMillis() - 1000
        val project = makeProject("tombstone-pull-proj", updatedAt = deletedAt).copy(deletedAt = deletedAt)
        projectService.upsert(userId, project)

        val response = client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(lastSyncedAt = 0, records = emptyList())))
        }

        val body = json.decodeFromString<SyncResponse>(response.bodyAsText())
        val tombstone = body.records.find { it.id == "tombstone-pull-proj" }
        assertNotNull(tombstone)
        val storedDeletedAt = tombstone.data["deletedAt"]?.toString()?.toLongOrNull()
        assertEquals(deletedAt, storedDeletedAt)
    }

    @Test
    fun `tombstone project is not returned by getAll REST endpoint`() = testApplication {
        installTestApp()
        val userId = "user-tombstone-list"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val deletedAt = System.currentTimeMillis()
        projectService.upsert(userId, makeProject("tombstone-visible", name = "Visible"))
        projectService.upsert(userId, makeProject("tombstone-hidden", name = "Hidden", updatedAt = deletedAt).copy(deletedAt = deletedAt))

        val response = client.get("/api/projects") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }

        val projects = json.decodeFromString<List<Project>>(response.bodyAsText())
        val ids = projects.map { it.id }
        assertTrue("tombstone-visible" in ids)
        assertTrue("tombstone-hidden" !in ids)
    }

    @Test
    fun `tombstone project with levelId skips pass 3 and does not fail on missing level FK`() = testApplication {
        installTestApp()
        val userId = "user-tombstone-fk"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val deletedAt = System.currentTimeMillis()
        // Tombstone with a levelId pointing to a level that does not exist — pass 3 must be skipped
        val project = makeProject("tombstone-fk-proj", updatedAt = deletedAt).copy(levelId = "non-existent-level", deletedAt = deletedAt)

        val response = client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(lastSyncedAt = 0, records = listOf(project.toSyncRecord()))))
        }

        assertEquals(HttpStatusCode.OK, response.status)
    }

    @Test
    fun `syncing new project with levelId resolves circular FK when level record arrives first`() = testApplication {
        installTestApp()
        val userId = "user-circular-fk-rev"
        val token = jwtService.generateToken(userId, "$userId@test.com", userId)

        // Level first in the request — also previously broken.
        val project = makeProject("circular-proj-rev").copy(levelId = "circular-level-rev")
        val level = makeLevel("circular-level-rev").copy(projectId = "circular-proj-rev")

        val response = client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(SyncRequest(
                lastSyncedAt = 0,
                records = listOf(level.toSyncRecord(), project.toSyncRecord())
            )))
        }

        assertEquals(HttpStatusCode.OK, response.status)
        val storedProject = projectService.getById(userId, "circular-proj-rev")
        val storedLevel = levelService.getById(userId, "circular-level-rev")
        assertNotNull(storedProject)
        assertNotNull(storedLevel)
        assertEquals("circular-level-rev", storedProject.levelId)
    }
}
