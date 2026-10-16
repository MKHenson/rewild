package com.rewild.play

import com.rewild.assets.AssetResult
import com.rewild.assets.AssetService
import com.rewild.assets.S3Signer
import com.rewild.auth.JwtService
import com.rewild.common.ErrorResponse
import com.rewild.db.tables.ProjectsTable
import com.rewild.installTestAuth
import com.rewild.levels.LevelService
import com.rewild.makeTestJwtService
import com.rewild.models.Atmosphere
import com.rewild.models.Level
import com.rewild.models.PlayProject
import com.rewild.models.Project
import com.rewild.models.SceneGraph
import com.rewild.models.UploadUrlRequest
import com.rewild.projects.ProjectService
import com.rewild.publicgame.PublicGameService
import com.rewild.shares.ShareService
import com.rewild.startTestDatabase
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.junit.AfterClass
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class PlayRoutesTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var jwtService: JwtService
        private lateinit var projects: ProjectService
        private lateinit var levels: LevelService
        private lateinit var assets: AssetService
        private lateinit var publicGame: PublicGameService
        private lateinit var service: PlayService
        private const val BASE_URL = "https://fake-s3/public"
        private const val OWNER = "play-owner"
        private const val ADMIN = "play-admin"
        private val json = Json { ignoreUnknownKeys = true }

        private val signer = object : S3Signer {
            override fun presignPut(bucket: String, key: String, ttlMinutes: Long, contentType: String?) =
                "https://fake-s3/presigned/$key"
        }

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            jwtService = makeTestJwtService()
            projects = ProjectService(bucketBaseUrl = BASE_URL)
            levels = LevelService()
            assets = AssetService(signer, "test-bucket", BASE_URL)
            publicGame = PublicGameService(BASE_URL)
            service = PlayService(projects, levels, assets, publicGame, ShareService()) { it == ADMIN }
        }

        @AfterClass
        @JvmStatic
        fun teardown() {
            postgres.close()
        }

        private fun makeProject(id: String, levelId: String) = Project(
            id = id,
            levelId = levelId,
            name = "Play $id",
            description = "",
            updatedAt = 1000L
        )

        private fun makeLevel(id: String, projectId: String) = Level(
            id = id,
            projectId = projectId,
            name = "Level $id",
            hasTerrain = true,
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

        /** A project with one level and one confirmed chunk file. Returns the file's storage key. */
        private fun seed(projectId: String): String {
            val levelId = "$projectId-level"
            projects.upsert(OWNER, makeProject(projectId, levelId).copy(levelId = null))
            levels.upsert(OWNER, makeLevel(levelId, projectId))
            projects.upsert(OWNER, makeProject(projectId, levelId))
            val storageKey = requestChunkUpload(projectId, levelId, "0_0.bin")
            assets.confirmUpload(OWNER, storageKey)
            return storageKey
        }

        private fun requestChunkUpload(projectId: String, levelId: String, filename: String): String {
            val req = UploadUrlRequest(projectId, levelId, "chunk", filename, "application/octet-stream", 1)
            return (assets.requestUploadUrl(OWNER, req) as AssetResult.Success).value.storageKey
        }
    }

    @Before
    fun clearPromotion() {
        publicGame.set(null)
    }

    private fun ApplicationTestBuilder.installTestApp() {
        installTestAuth(jwtService) {}
        routing {
            route("/api") {
                authenticate("auth-jwt", optional = true) { playRoutes(service) }
            }
        }
    }

    private fun tokenFor(id: String) = jwtService.generateToken(id, "$id@test.com", id)

    private suspend fun ApplicationTestBuilder.play(projectId: String, userId: String? = null) =
        client.get("/api/play/$projectId") {
            if (userId != null) header(HttpHeaders.Authorization, "Bearer ${tokenFor(userId)}")
        }

    private suspend fun decode(response: HttpResponse) =
        json.decodeFromString<PlayProject>(response.bodyAsText())

    @Test
    fun `a logged out player loads the public project with its levels and versioned files`() = testApplication {
        installTestApp()
        val key = seed("play-public")
        publicGame.set("play-public")

        val response = play("play-public")
        assertEquals(HttpStatusCode.OK, response.status)
        val data = decode(response)
        assertEquals("play-public", data.project.id)
        assertEquals(listOf("play-public-level"), data.levels.map { it.id })
        val asset = data.assets.single()
        assertEquals("play-public-level", asset.levelId)
        assertEquals("$BASE_URL/$key?v=${asset.updatedAt}", asset.publicUrl)
        assertTrue(asset.updatedAt > 0)
    }

    @Test
    fun `the owner loads a project that is not public`() = testApplication {
        installTestApp()
        seed("play-own")

        assertEquals(HttpStatusCode.OK, play("play-own", OWNER).status)
    }

    @Test
    fun `anyone else gets 404 for a project that is not public`() = testApplication {
        installTestApp()
        seed("play-private")

        assertEquals(HttpStatusCode.NotFound, play("play-private").status)
        assertEquals(HttpStatusCode.NotFound, play("play-private", "play-stranger").status)
        assertEquals(HttpStatusCode.NotFound, play("play-missing", OWNER).status)
    }

    @Test
    fun `a deleted project is not found, also for the owner`() = testApplication {
        installTestApp()
        seed("play-deleted")
        projects.delete(OWNER, "play-deleted")

        assertEquals(HttpStatusCode.NotFound, play("play-deleted", OWNER).status)
    }

    @Test
    fun `unconfirmed files and deleted levels are left out`() = testApplication {
        installTestApp()
        seed("play-partial")
        requestChunkUpload("play-partial", "play-partial-level", "1_0.bin")
        levels.upsert(OWNER, makeLevel("play-partial-gone", "play-partial"))
        levels.delete(OWNER, "play-partial-gone")

        val data = decode(play("play-partial", OWNER))
        assertEquals(listOf("play-partial-level"), data.levels.map { it.id })
        assertEquals(listOf("0_0.bin"), data.assets.map { it.filename })
    }

    @Test
    fun `a re-uploaded file gets a new URL`() = testApplication {
        installTestApp()
        val key = seed("play-reupload")
        val before = decode(play("play-reupload", OWNER)).assets.single().publicUrl

        Thread.sleep(2)
        requestChunkUpload("play-reupload", "play-reupload-level", "0_0.bin")
        assets.confirmUpload(OWNER, key)

        val after = decode(play("play-reupload", OWNER)).assets.single().publicUrl
        assertNotEquals(before, after)
    }

    private fun flag(projectId: String) = transaction {
        ProjectsTable.update({ ProjectsTable.id eq projectId }) {
            it[flaggedAt] = System.currentTimeMillis()
            it[flaggedBy] = ADMIN
        }
    }

    @Test
    fun `a super admin loads any project`() = testApplication {
        installTestApp()
        seed("play-admin-run")

        assertEquals(HttpStatusCode.OK, play("play-admin-run", ADMIN).status)
    }

    @Test
    fun `a flagged project still loads for its owner and super admins`() = testApplication {
        installTestApp()
        seed("play-flagged-own")
        flag("play-flagged-own")

        assertEquals(HttpStatusCode.OK, play("play-flagged-own", OWNER).status)
        assertEquals(HttpStatusCode.OK, play("play-flagged-own", ADMIN).status)
        assertEquals(HttpStatusCode.NotFound, play("play-flagged-own", "play-stranger").status)
    }

    @Test
    fun `a flagged project tells everyone else to contact an admin`() = testApplication {
        installTestApp()
        seed("play-flagged-public")
        publicGame.set("play-flagged-public")
        flag("play-flagged-public")

        val response = play("play-flagged-public")
        assertEquals(HttpStatusCode.Forbidden, response.status)
        assertTrue(json.decodeFromString<ErrorResponse>(response.bodyAsText()).error.contains("Contact an admin"))
    }
}
