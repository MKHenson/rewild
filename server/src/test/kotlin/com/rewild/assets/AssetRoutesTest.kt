package com.rewild.assets

import com.rewild.auth.JwtService
import com.rewild.common.ErrorResponse
import com.rewild.installTestAuth
import com.rewild.levels.LevelService
import com.rewild.makeTestJwtService
import com.rewild.models.*
import com.rewild.projects.ProjectService
import com.rewild.startTestDatabase
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

// Stands in for the bucket: an upload is simulated by adding an object directly.
private class FakeAssetBucket : S3Signer, S3Inspector, S3Deleter {
    val objects = mutableMapOf<String, ObjectHead>()

    override fun presignPut(bucket: String, key: String, ttlMinutes: Long, contentType: String?) =
        "https://fake-s3/presigned/$key"

    override fun head(bucket: String, key: String) = objects[key]

    override fun deletePrefix(bucket: String, prefix: String): Int {
        val matched = objects.keys.filter { it.startsWith(prefix) }
        matched.forEach { objects.remove(it) }
        return matched.size
    }
}

private const val BINARY = "application/octet-stream"
private const val MB = 1024L * 1024

class AssetRoutesTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var jwtService: JwtService
        private lateinit var service: AssetService
        private lateinit var projectService: ProjectService
        private lateinit var levelService: LevelService
        private val bucket = FakeAssetBucket()
        private val json = Json { ignoreUnknownKeys = true }
        private const val BASE_URL = "https://fake-s3/public"

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            jwtService = makeTestJwtService()
            val cleanup = AssetCleanupService(s3 = bucket, bucketName = "test-bucket")
            projectService = ProjectService(cleanup, BASE_URL)
            levelService = LevelService(cleanup)
            service = AssetService(bucket, "test-bucket", BASE_URL, inspector = bucket, cleanup = cleanup)
        }

        @AfterClass
        @JvmStatic
        fun teardown() {
            postgres.close()
        }

        private fun makeProject(id: String) = Project(
            id = id,
            name = "Fixture Project",
            description = "",
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

        private fun makeLevel(id: String, projectId: String) = Level(
            id = id,
            projectId = projectId,
            name = "Fixture Level",
            hasTerrain = false,
            startEvent = "",
            containers = emptyList(),
            updatedAt = 1000L
        )

        /** A project with one level, both prefixed [prefix]. */
        private fun seed(user: String, prefix: String): Pair<String, String> {
            val project = "$prefix-proj"
            val level = "$prefix-level"
            projectService.upsert(user, makeProject(project))
            levelService.upsert(user, makeLevel(level, project))
            return project to level
        }

        private fun chunk(projectId: String, levelId: String?, filename: String = "0_0.bin", size: Long = 10) =
            UploadUrlRequest(projectId, levelId, "chunk", filename, BINARY, size)

        private fun image(projectId: String, contentType: String = "image/png", size: Long = 1000) =
            UploadUrlRequest(projectId, null, "image", "image", contentType, size)
    }

    private fun ApplicationTestBuilder.installTestApp() {
        installTestAuth(jwtService) { assetRoutes(service) }
    }

    private fun HttpRequestBuilder.auth(userId: String) =
        header(HttpHeaders.Authorization, "Bearer ${jwtService.generateToken(userId, "$userId@test.com", userId)}")

    private suspend fun ApplicationTestBuilder.requestUpload(userId: String, req: UploadUrlRequest) =
        client.post("/api/assets/upload-url") {
            auth(userId)
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(req))
        }

    private suspend fun ApplicationTestBuilder.confirm(userId: String, storageKey: String) =
        client.post("/api/assets/confirm") {
            auth(userId)
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(ConfirmRequest(storageKey)))
        }

    private suspend fun ApplicationTestBuilder.list(userId: String) =
        json.decodeFromString<List<Asset>>(client.get("/api/assets") { auth(userId) }.bodyAsText())

    /** Requests a URL, puts an object at its key as the upload would, and confirms it. */
    private suspend fun ApplicationTestBuilder.upload(
        userId: String,
        req: UploadUrlRequest,
        stored: ObjectHead = ObjectHead(req.size, req.contentType)
    ): Pair<String, HttpResponse> {
        val key = json.decodeFromString<UploadUrlResponse>(requestUpload(userId, req).bodyAsText()).storageKey
        bucket.objects[key] = stored
        return key to confirm(userId, key)
    }

    private suspend fun error(response: HttpResponse) = json.decodeFromString<ErrorResponse>(response.bodyAsText()).error

    // --- Auth guard ---

    @Test
    fun `every route needs a token`() = testApplication {
        installTestApp()
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/assets").status)
        assertEquals(HttpStatusCode.Unauthorized, client.post("/api/assets/upload-url") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(chunk("p", "l")))
        }.status)
        assertEquals(HttpStatusCode.Unauthorized, client.post("/api/assets/confirm") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(ConfirmRequest("some/key")))
        }.status)
    }

    // --- Upload URL ---

    @Test
    fun `a level file goes under its level and a project file under the project`() = testApplication {
        installTestApp()
        val (project, level) = seed("keys-user", "keys")

        val levelKey = json.decodeFromString<UploadUrlResponse>(requestUpload("keys-user", chunk(project, level)).bodyAsText())
        val imageKey = json.decodeFromString<UploadUrlResponse>(requestUpload("keys-user", image(project)).bodyAsText())

        assertEquals("users/keys-user/projects/$project/levels/$level/chunk/0_0.bin", levelKey.storageKey)
        assertEquals("users/keys-user/projects/$project/image/image", imageKey.storageKey)
        assertTrue(levelKey.uploadUrl.startsWith("https://fake-s3/presigned/"))
    }

    @Test
    fun `an upload that breaks its type's rule is rejected`() = testApplication {
        installTestApp()
        val (project, level) = seed("rules-user", "rules")

        val cases = mapOf(
            UploadUrlRequest(project, level, "sound", "a.ogg", "audio/ogg", 10) to "Unknown asset type",
            chunk(project, null) to "belongs to a level",
            image(project).copy(levelId = level) to "belongs to the project",
            image(project).copy(filename = "cover") to "Invalid filename",
            chunk(project, level, filename = "../escape") to "Invalid filename",
            image(project, contentType = "image/gif") to "PNG, JPEG or WebP",
            image(project, size = 2 * MB + 1) to "2 MB",
            chunk(project, level).copy(contentType = "text/plain") to "binary",
            chunk(project, level, size = 0) to "16 MB",
        )
        for ((req, message) in cases) {
            val response = requestUpload("rules-user", req)
            assertEquals(HttpStatusCode.BadRequest, response.status, "$req")
            assertTrue(error(response).contains(message), "$req: ${error(response)}")
        }
    }

    @Test
    fun `only the owner of a live project and level gets an upload URL`() = testApplication {
        installTestApp()
        val (project, level) = seed("owner-user", "owner")
        val (otherProject, _) = seed("owner-user", "owner-other")
        levelService.upsert("owner-user", makeLevel("owner-deleted-level", project).copy(deletedAt = 2000L))

        assertEquals(HttpStatusCode.NotFound, requestUpload("owner-intruder", chunk(project, level)).status)
        assertEquals(HttpStatusCode.NotFound, requestUpload("owner-intruder", image(project)).status)
        assertEquals(HttpStatusCode.NotFound, requestUpload("owner-user", chunk(project, "no-such-level")).status)
        assertEquals(HttpStatusCode.NotFound, requestUpload("owner-user", chunk(project, "owner-deleted-level")).status)
        assertEquals(HttpStatusCode.NotFound, requestUpload("owner-user", chunk(otherProject, level)).status)
        assertEquals(HttpStatusCode.NotFound, requestUpload("owner-user", image("no-such-proj")).status)
    }

    // --- Confirm ---

    @Test
    fun `confirm returns the asset with its version and lists it`() = testApplication {
        installTestApp()
        val (project, level) = seed("confirm-user", "confirm")

        val (key, response) = upload("confirm-user", chunk(project, level))

        assertEquals(HttpStatusCode.OK, response.status)
        val asset = json.decodeFromString<Asset>(response.bodyAsText())
        assertEquals(level, asset.levelId)
        assertEquals(BINARY, asset.contentType)
        assertTrue(asset.updatedAt > 0)
        assertEquals("$BASE_URL/$key?v=${asset.updatedAt}", asset.publicUrl)
        assertEquals(listOf(asset), list("confirm-user"))
    }

    @Test
    fun `a project file is listed with no level`() = testApplication {
        installTestApp()
        val (project, _) = seed("list-image-user", "list-image")

        upload("list-image-user", image(project, contentType = "image/webp"))

        val asset = list("list-image-user").single()
        assertEquals(project, asset.projectId)
        assertNull(asset.levelId)
        assertEquals("image/webp", asset.contentType)
    }

    @Test
    fun `confirm rejects and deletes an object that breaks the rule or does not match the request`() = testApplication {
        installTestApp()
        val (project, _) = seed("reject-user", "reject")

        val (bigKey, big) = upload("reject-user", image(project), stored = ObjectHead(2 * MB + 1, "image/png"))
        assertEquals(HttpStatusCode.BadRequest, big.status)
        assertFalse(bigKey in bucket.objects)

        val (typeKey, type) = upload("reject-user", image(project), stored = ObjectHead(1000, "image/gif"))
        assertEquals(HttpStatusCode.BadRequest, type.status)
        assertFalse(typeKey in bucket.objects)

        assertTrue(list("reject-user").isEmpty())
    }

    @Test
    fun `confirm rejects a file that was never uploaded`() = testApplication {
        installTestApp()
        val (project, _) = seed("missing-user", "missing")
        val key = json.decodeFromString<UploadUrlResponse>(requestUpload("missing-user", image(project)).bodyAsText()).storageKey

        assertEquals(HttpStatusCode.BadRequest, confirm("missing-user", key).status)
    }

    @Test
    fun `confirm returns 404 for an unknown key or another user's upload`() = testApplication {
        installTestApp()
        val (project, level) = seed("theirs-user", "theirs")
        val key = json.decodeFromString<UploadUrlResponse>(requestUpload("theirs-user", chunk(project, level)).bodyAsText()).storageKey
        bucket.objects[key] = ObjectHead(10, BINARY)

        assertEquals(HttpStatusCode.NotFound, confirm("theirs-user", "users/x/projects/y/chunk/ghost.bin").status)
        assertEquals(HttpStatusCode.NotFound, confirm("theirs-intruder", key).status)
    }

    @Test
    fun `a re-upload keeps the confirmed version listed until it is confirmed, then gets a new URL`() = testApplication {
        installTestApp()
        val (project, _) = seed("reupload-user", "reupload")
        val (key, first) = upload("reupload-user", image(project))
        val before = json.decodeFromString<Asset>(first.bodyAsText())

        requestUpload("reupload-user", image(project, contentType = "image/jpeg"))
        assertEquals(before, list("reupload-user").single())

        Thread.sleep(2)
        bucket.objects[key] = ObjectHead(1000, "image/jpeg")
        val after = json.decodeFromString<Asset>(confirm("reupload-user", key).bodyAsText())
        assertNotEquals(before.publicUrl, after.publicUrl)
        assertEquals("image/jpeg", after.contentType)
    }

    @Test
    fun `files of a deleted level or project are not listed`() = testApplication {
        installTestApp()
        val (project, level) = seed("gone-user", "gone")
        upload("gone-user", chunk(project, level))
        upload("gone-user", image(project))
        levelService.delete("gone-user", level)

        assertEquals(listOf("image"), list("gone-user").map { it.assetType })

        projectService.delete("gone-user", project)
        assertTrue(list("gone-user").isEmpty())
    }

    // --- The project image on project reads ---

    @Test
    fun `project reads carry the image asset's URL`() = testApplication {
        installTestApp()
        val (project, _) = seed("read-user", "read")
        assertNull(projectService.getById("read-user", project)!!.imageUrl)

        val (_, response) = upload("read-user", image(project))
        val asset = json.decodeFromString<Asset>(response.bodyAsText())

        assertEquals(asset.publicUrl, projectService.getById("read-user", project)!!.imageUrl)
        assertEquals(asset.publicUrl, projectService.list("read-user", com.rewild.projects.ProjectScope.MINE).single().imageUrl)
    }

    @Test
    fun `deleting a project removes all of its files`() = testApplication {
        installTestApp()
        val (project, level) = seed("delete-user", "delete")
        val (chunkKey, _) = upload("delete-user", chunk(project, level))
        val (imageKey, _) = upload("delete-user", image(project))

        projectService.delete("delete-user", project)

        assertFalse(chunkKey in bucket.objects)
        assertFalse(imageKey in bucket.objects)
    }
}
