package com.rewild.projects

import com.rewild.installTestAuth
import com.rewild.makeTestJwtService
import com.rewild.startTestDatabase
import com.rewild.assets.AssetCleanupService
import com.rewild.assets.ObjectHead
import com.rewild.assets.S3Deleter
import com.rewild.assets.S3Inspector
import com.rewild.assets.S3Signer
import com.rewild.auth.JwtService
import com.rewild.common.ErrorResponse
import com.rewild.models.Atmosphere
import com.rewild.models.ConfirmRequest
import com.rewild.models.Project
import com.rewild.models.ProjectImageResponse
import com.rewild.models.ProjectImageUploadRequest
import com.rewild.models.SceneGraph
import com.rewild.models.UploadUrlResponse
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
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

// Stands in for the bucket: an upload is simulated by adding an object directly.
private class FakeImageBucket : S3Signer, S3Inspector, S3Deleter {
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

class ProjectRoutesTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var jwtService: JwtService
        private lateinit var service: ProjectService
        private lateinit var imageService: ProjectImageService
        private val bucket = FakeImageBucket()
        private const val BASE_URL = "https://fake-s3/public"
        private val json = Json { ignoreUnknownKeys = true }

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            jwtService = makeTestJwtService()
            val cleanup = AssetCleanupService(s3 = bucket, bucketName = "test-bucket")
            service = ProjectService(cleanup, BASE_URL)
            imageService = ProjectImageService(bucket, bucket, "test-bucket", BASE_URL, cleanup)
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
        installTestAuth(jwtService) { projectRoutes(service, imageService) }
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
    fun `GET projects does not return tombstoned projects`() = testApplication {
        installTestApp()
        val userId = "user-tombstone-list-proj"
        val deletedAt = System.currentTimeMillis()
        service.upsert(userId, makeProject("tombstone-visible-proj"))
        service.upsert(userId, makeProject("tombstone-hidden-proj").copy(deletedAt = deletedAt, updatedAt = deletedAt))

        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val response = client.get("/api/projects") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val projects = json.decodeFromString<List<Project>>(response.bodyAsText())
        val ids = projects.map { it.id }
        assertTrue("tombstone-visible-proj" in ids)
        assertTrue("tombstone-hidden-proj" !in ids)
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
    fun `DELETE keeps a tombstone and a second DELETE returns 404`() = testApplication {
        installTestApp()
        val userId = "user-delete-twice"
        service.upsert(userId, makeProject("delete-twice-proj"))

        val token = jwtService.generateToken(userId, "$userId@test.com", userId)
        val first = client.delete("/api/projects/delete-twice-proj") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        val second = client.delete("/api/projects/delete-twice-proj") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }

        assertEquals(HttpStatusCode.NoContent, first.status)
        assertEquals(HttpStatusCode.NotFound, second.status)
        assertNotNull(service.getById(userId, "delete-twice-proj")?.deletedAt)
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

    // --- Project image ---

    private fun tokenFor(userId: String) = jwtService.generateToken(userId, "$userId@test.com", userId)

    private suspend fun ApplicationTestBuilder.requestImageUpload(
        userId: String,
        projectId: String,
        contentType: String = "image/png",
        size: Long = 1000
    ) = client.post("/api/projects/$projectId/image/upload-url") {
        header(HttpHeaders.Authorization, "Bearer ${tokenFor(userId)}")
        contentType(ContentType.Application.Json)
        setBody(json.encodeToString(ProjectImageUploadRequest(contentType, size)))
    }

    private suspend fun ApplicationTestBuilder.confirmImage(userId: String, projectId: String, storageKey: String) =
        client.post("/api/projects/$projectId/image/confirm") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor(userId)}")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(ConfirmRequest(storageKey)))
        }

    // Requests a URL, puts an object at its key, and confirms it.
    private suspend fun ApplicationTestBuilder.uploadImage(
        userId: String,
        projectId: String,
        size: Long = 1000,
        contentType: String = "image/png"
    ): Pair<String, HttpResponse> {
        val upload = json.decodeFromString<UploadUrlResponse>(requestImageUpload(userId, projectId).bodyAsText())
        bucket.objects[upload.storageKey] = ObjectHead(size, contentType)
        return upload.storageKey to confirmImage(userId, projectId, upload.storageKey)
    }

    @Test
    fun `image upload-url returns a key under the project's image prefix`() = testApplication {
        installTestApp()
        service.upsert("img-owner", makeProject("img-url-proj"))

        val response = requestImageUpload("img-owner", "img-url-proj", "image/webp")

        assertEquals(HttpStatusCode.OK, response.status)
        val body = json.decodeFromString<UploadUrlResponse>(response.bodyAsText())
        assertTrue(body.storageKey.startsWith("users/img-owner/projects/img-url-proj/image/"))
        assertTrue(body.storageKey.endsWith(".webp"))
    }

    @Test
    fun `image upload-url rejects other file types and files over 2 MB`() = testApplication {
        installTestApp()
        service.upsert("img-owner", makeProject("img-reject-proj"))

        val wrongType = requestImageUpload("img-owner", "img-reject-proj", "image/gif")
        val tooLarge = requestImageUpload("img-owner", "img-reject-proj", size = MAX_PROJECT_IMAGE_BYTES + 1)

        assertEquals(HttpStatusCode.BadRequest, wrongType.status)
        assertTrue(json.decodeFromString<ErrorResponse>(wrongType.bodyAsText()).error.contains("PNG"))
        assertEquals(HttpStatusCode.BadRequest, tooLarge.status)
        assertTrue(json.decodeFromString<ErrorResponse>(tooLarge.bodyAsText()).error.contains("2 MB"))
    }

    @Test
    fun `image endpoints are owner only`() = testApplication {
        installTestApp()
        service.upsert("img-owner", makeProject("img-private-proj"))

        assertEquals(HttpStatusCode.Forbidden, requestImageUpload("img-intruder", "img-private-proj").status)
        assertEquals(HttpStatusCode.NotFound, requestImageUpload("img-owner", "img-no-such-proj").status)
    }

    @Test
    fun `confirm sets the image and a new image deletes the old one`() = testApplication {
        installTestApp()
        service.upsert("img-owner", makeProject("img-replace-proj"))

        val (firstKey, first) = uploadImage("img-owner", "img-replace-proj")
        assertEquals(HttpStatusCode.OK, first.status)
        assertEquals("$BASE_URL/$firstKey", json.decodeFromString<ProjectImageResponse>(first.bodyAsText()).imageUrl)
        assertEquals("$BASE_URL/$firstKey", service.getById("img-owner", "img-replace-proj")?.imageUrl)

        val (secondKey, second) = uploadImage("img-owner", "img-replace-proj")
        assertEquals(HttpStatusCode.OK, second.status)
        assertEquals("$BASE_URL/$secondKey", service.getById("img-owner", "img-replace-proj")?.imageUrl)
        assertFalse(firstKey in bucket.objects)
        assertTrue(secondKey in bucket.objects)
    }

    @Test
    fun `confirm bumps updatedAt so other devices pull the image`() = testApplication {
        installTestApp()
        service.upsert("img-owner", makeProject("img-bump-proj"))

        uploadImage("img-owner", "img-bump-proj")

        assertTrue(service.getById("img-owner", "img-bump-proj")!!.updatedAt > 1000L)
    }

    @Test
    fun `confirm rejects and deletes an uploaded object that is too large or the wrong type`() = testApplication {
        installTestApp()
        service.upsert("img-owner", makeProject("img-oversize-proj"))

        val (bigKey, big) = uploadImage("img-owner", "img-oversize-proj", size = MAX_PROJECT_IMAGE_BYTES + 1)
        val (gifKey, gif) = uploadImage("img-owner", "img-oversize-proj", contentType = "image/gif")

        assertEquals(HttpStatusCode.BadRequest, big.status)
        assertEquals(HttpStatusCode.BadRequest, gif.status)
        assertFalse(bigKey in bucket.objects)
        assertFalse(gifKey in bucket.objects)
        assertNull(service.getById("img-owner", "img-oversize-proj")?.imageUrl)
    }

    @Test
    fun `confirm rejects a key outside the project's image prefix and a missing object`() = testApplication {
        installTestApp()
        service.upsert("img-owner", makeProject("img-key-proj"))
        service.upsert("img-owner", makeProject("img-key-other"))
        val otherKey = json.decodeFromString<UploadUrlResponse>(
            requestImageUpload("img-owner", "img-key-other").bodyAsText()
        ).storageKey
        bucket.objects[otherKey] = ObjectHead(1000, "image/png")
        val missingKey = json.decodeFromString<UploadUrlResponse>(
            requestImageUpload("img-owner", "img-key-proj").bodyAsText()
        ).storageKey

        assertEquals(HttpStatusCode.BadRequest, confirmImage("img-owner", "img-key-proj", otherKey).status)
        assertEquals(HttpStatusCode.BadRequest, confirmImage("img-owner", "img-key-proj", missingKey).status)
        assertNull(service.getById("img-owner", "img-key-proj")?.imageUrl)
    }

    @Test
    fun `a project write from the client keeps the image`() = testApplication {
        installTestApp()
        service.upsert("img-owner", makeProject("img-keep-proj"))
        val (key, _) = uploadImage("img-owner", "img-keep-proj")

        service.upsert("img-owner", makeProject("img-keep-proj", name = "Renamed").copy(updatedAt = 9_999_999_999_999L))

        assertEquals("$BASE_URL/$key", service.getById("img-owner", "img-keep-proj")?.imageUrl)
    }

    @Test
    fun `deleting a project removes its image`() = testApplication {
        installTestApp()
        service.upsert("img-owner", makeProject("img-delete-proj"))
        val (key, _) = uploadImage("img-owner", "img-delete-proj")

        client.delete("/api/projects/img-delete-proj") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("img-owner")}")
        }

        assertFalse(key in bucket.objects)
    }
}
