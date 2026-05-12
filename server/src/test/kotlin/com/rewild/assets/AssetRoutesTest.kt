package com.rewild.assets

import com.rewild.installTestAuth
import com.rewild.makeTestJwtService
import com.rewild.startTestDatabase
import com.rewild.auth.JwtService
import com.rewild.db.tables.AssetsTable
import com.rewild.levels.LevelService
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
import org.jetbrains.exposed.sql.insertIgnore
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AssetRoutesTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var jwtService: JwtService
        private lateinit var service: AssetService
        private lateinit var projectService: ProjectService
        private lateinit var levelService: LevelService
        private val json = Json { ignoreUnknownKeys = true }

        const val USER_A = "asset-user-a"
        const val USER_B = "asset-user-b"
        const val PROJECT_A = "asset-proj-a"
        const val LEVEL_A = "asset-level-a"

        // Returns a fixed URL so tests never hit real AWS.
        private val fakeS3 = object : S3Signer {
            override fun presignPut(bucket: String, key: String, ttlMinutes: Long) =
                "https://fake-s3/presigned/$key"
        }

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            jwtService = makeTestJwtService()
            projectService = ProjectService()
            levelService = LevelService()
            service = AssetService(s3 = fakeS3, bucketName = "test-bucket", bucketBaseUrl = "https://fake-s3/public")

            projectService.upsert(USER_A, makeProject(PROJECT_A))
            levelService.upsert(USER_A, makeLevel(LEVEL_A, PROJECT_A))
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

        private fun makeLevel(id: String, projectId: String) = Level(
            id = id,
            userId = "placeholder",
            projectId = projectId,
            name = "Fixture Level",
            activeOnStartup = false,
            hasTerrain = false,
            startEvent = "",
            containers = emptyList(),
            updatedAt = 1000L
        )

        private fun insertConfirmedAsset(id: String, userId: String, levelId: String, storageKey: String) = transaction {
            AssetsTable.insertIgnore {
                it[AssetsTable.id] = id
                it[AssetsTable.userId] = userId
                it[AssetsTable.levelId] = levelId
                it[AssetsTable.assetType] = "chunk"
                it[AssetsTable.filename] = "terrain.bin"
                it[AssetsTable.storageKey] = storageKey
                it[AssetsTable.confirmed] = true
                it[AssetsTable.createdAt] = System.currentTimeMillis()
            }
        }
    }

    private fun ApplicationTestBuilder.installTestApp() {
        installTestAuth(jwtService) { assetRoutes(service) }
    }

    // --- Auth guard ---

    @Test
    fun `request without token returns 401`() = testApplication {
        installTestApp()
        val response = client.get("/api/assets")
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun `upload-url without token returns 401`() = testApplication {
        installTestApp()
        val response = client.post("/api/assets/upload-url") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(UploadUrlRequest(LEVEL_A, "chunk", "x.bin")))
        }
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun `confirm without token returns 401`() = testApplication {
        installTestApp()
        val response = client.post("/api/assets/confirm") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(ConfirmRequest("some/key")))
        }
        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    // --- GET /api/assets ---

    @Test
    fun `GET assets returns only confirmed assets for the authenticated user`() = testApplication {
        installTestApp()
        val userId = "list-assets-user"
        val levelId = "list-assets-level"
        projectService.upsert(userId, makeProject("list-assets-proj"))
        levelService.upsert(userId, makeLevel(levelId, "list-assets-proj"))
        insertConfirmedAsset("list-asset-1", userId, levelId, "levels/$levelId/chunk/a.bin")
        insertConfirmedAsset("list-asset-2", USER_A, LEVEL_A, "levels/$LEVEL_A/chunk/b.bin")

        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val response = client.get("/api/assets") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, response.status)

        val assets = json.decodeFromString<List<Asset>>(response.bodyAsText())
        assertEquals(1, assets.size)
        assertEquals("list-asset-1", assets[0].id)
    }

    @Test
    fun `GET assets returns empty list when user has no confirmed assets`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken("no-assets-user", "no-assets@test.com", "no-assets-user")
        val response = client.get("/api/assets") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val assets = json.decodeFromString<List<Asset>>(response.bodyAsText())
        assertTrue(assets.isEmpty())
    }

    // --- POST /api/assets/upload-url ---

    @Test
    fun `upload-url returns presigned URL for owned level`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken(USER_A, "$USER_A@test.com", USER_A)
        val response = client.post("/api/assets/upload-url") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(UploadUrlRequest(LEVEL_A, "chunk", "terrain.bin")))
        }
        assertEquals(HttpStatusCode.OK, response.status)

        val body = json.decodeFromString<UploadUrlResponse>(response.bodyAsText())
        assertTrue(body.uploadUrl.startsWith("https://fake-s3/presigned/"))
        assertTrue(body.storageKey.contains(LEVEL_A))
        assertTrue(body.publicUrl.startsWith("https://fake-s3/public/"))
    }

    @Test
    fun `upload-url returns 403 when level does not belong to user`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken(USER_B, "$USER_B@test.com", USER_B)
        val response = client.post("/api/assets/upload-url") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(UploadUrlRequest(LEVEL_A, "chunk", "terrain.bin")))
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
    }

    @Test
    fun `upload-url returns 403 for a level that does not exist`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken(USER_A, "$USER_A@test.com", USER_A)
        val response = client.post("/api/assets/upload-url") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(UploadUrlRequest("nonexistent-level", "chunk", "x.bin")))
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
    }

    // --- POST /api/assets/confirm ---

    @Test
    fun `confirm marks asset as confirmed`() = testApplication {
        installTestApp()
        val levelId = "confirm-level"
        val userId = "confirm-user"
        projectService.upsert(userId, makeProject("confirm-proj"))
        levelService.upsert(userId, makeLevel(levelId, "confirm-proj"))

        val token = jwtService.generateToken(userId, "$userId@test.com", userId)

        // First request the upload URL so an unconfirmed record exists
        client.post("/api/assets/upload-url") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(UploadUrlRequest(levelId, "chunk", "new.bin")))
        }

        // Confirm it
        val storageKey = "levels/$levelId/chunk/new.bin"
        val confirmResponse = client.post("/api/assets/confirm") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(ConfirmRequest(storageKey)))
        }
        assertEquals(HttpStatusCode.NoContent, confirmResponse.status)

        // Should now appear in list
        val listResponse = client.get("/api/assets") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        val assets = json.decodeFromString<List<Asset>>(listResponse.bodyAsText())
        assertTrue(assets.any { it.filename == "new.bin" })
    }

    @Test
    fun `confirm returns 404 for an unknown storage key`() = testApplication {
        installTestApp()
        val token = jwtService.generateToken(USER_A, "$USER_A@test.com", USER_A)
        val response = client.post("/api/assets/confirm") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(ConfirmRequest("levels/does-not-exist/chunk/ghost.bin")))
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    @Test
    fun `confirm returns 404 when storage key belongs to another user`() = testApplication {
        installTestApp()
        val userAToken = jwtService.generateToken(USER_A, "$USER_A@test.com", USER_A)

        // USER_A requests an upload URL (creates unconfirmed record)
        client.post("/api/assets/upload-url") {
            header(HttpHeaders.Authorization, "Bearer $userAToken")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(UploadUrlRequest(LEVEL_A, "chunk", "other-user.bin")))
        }

        // USER_B tries to confirm it
        val userBToken = jwtService.generateToken(USER_B, "$USER_B@test.com", USER_B)
        val storageKey = "levels/$LEVEL_A/chunk/other-user.bin"
        val response = client.post("/api/assets/confirm") {
            header(HttpHeaders.Authorization, "Bearer $userBToken")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(ConfirmRequest(storageKey)))
        }
        assertEquals(HttpStatusCode.NotFound, response.status)
    }
}
