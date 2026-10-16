package com.rewild.shares

import com.rewild.assets.AssetService
import com.rewild.assets.S3Signer
import com.rewild.auth.JwtService
import com.rewild.db.tables.ProjectsTable
import com.rewild.db.tables.UsersTable
import com.rewild.installTestAuth
import com.rewild.levels.LevelService
import com.rewild.makeTestJwtService
import com.rewild.models.AddShareRequest
import com.rewild.models.Atmosphere
import com.rewild.models.Project
import com.rewild.models.ProjectShare
import com.rewild.models.SceneGraph
import com.rewild.play.PlayService
import com.rewild.play.playRoutes
import com.rewild.projects.ProjectService
import com.rewild.projects.projectRoutes
import com.rewild.publicgame.PublicGameService
import com.rewild.startTestDatabase
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.auth.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ShareRoutesTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var jwtService: JwtService
        private lateinit var projects: ProjectService
        private lateinit var shares: ShareService
        private lateinit var play: PlayService
        private const val BASE_URL = "https://fake-s3/public"
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
            shares = ShareService()
            val publicGame = PublicGameService(BASE_URL)
            play = PlayService(projects, LevelService(), AssetService(signer, "test-bucket", BASE_URL), publicGame, shares) { false }
        }

        @AfterClass
        @JvmStatic
        fun teardown() {
            postgres.close()
        }

        private fun insertUser(id: String) = transaction {
            UsersTable.insert {
                it[UsersTable.id] = id
                it[email] = "$id@test.com"
                it[displayName] = "Name $id"
                it[createdAt] = System.currentTimeMillis()
            }
        }

        private fun makeProject(id: String, updatedAt: Long = 1000L) = Project(
            id = id,
            name = "Project $id",
            description = "",
            updatedAt = updatedAt
        )

        private fun flag(projectId: String) = transaction {
            ProjectsTable.update({ ProjectsTable.id eq projectId }) {
                it[flaggedAt] = System.currentTimeMillis()
                it[flaggedBy] = "share-admin"
            }
        }
    }

    private fun ApplicationTestBuilder.installTestApp() {
        installTestAuth(jwtService) {
            shareRoutes(shares)
            projectRoutes(projects)
        }
        routing {
            route("/api") {
                authenticate("auth-jwt", optional = true) { playRoutes(play) }
            }
        }
    }

    private fun HttpRequestBuilder.auth(userId: String) =
        header(HttpHeaders.Authorization, "Bearer ${jwtService.generateToken(userId, "$userId@test.com", userId)}")

    private suspend fun ApplicationTestBuilder.share(projectId: String, userId: String, as_: String) =
        client.post("/api/projects/$projectId/shares") {
            auth(as_)
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(AddShareRequest(userId)))
        }

    private suspend fun ApplicationTestBuilder.listShares(projectId: String, as_: String) =
        client.get("/api/projects/$projectId/shares") { auth(as_) }

    private suspend fun ApplicationTestBuilder.revoke(projectId: String, userId: String, as_: String) =
        client.delete("/api/projects/$projectId/shares/$userId") { auth(as_) }

    private suspend fun ApplicationTestBuilder.playAs(projectId: String, userId: String) =
        client.get("/api/play/$projectId") { auth(userId) }

    private suspend fun ApplicationTestBuilder.sharedWith(userId: String) =
        json.decodeFromString<List<Project>>(
            client.get("/api/projects?scope=shared") { auth(userId) }.bodyAsText()
        )

    /** An owner, a friend and a project of the owner's, all prefixed with [prefix]. */
    private fun seed(prefix: String): Triple<String, String, String> {
        val owner = "$prefix-owner"
        val friend = "$prefix-friend"
        val project = "$prefix-project"
        insertUser(owner)
        insertUser(friend)
        projects.upsert(owner, makeProject(project))
        return Triple(owner, friend, project)
    }

    @Test
    fun `the owner adds, lists and revokes a share`() = testApplication {
        installTestApp()
        val (owner, friend, project) = seed("share-crud")

        val added = share(project, friend, owner)
        assertEquals(HttpStatusCode.OK, added.status)
        val share = json.decodeFromString<ProjectShare>(added.bodyAsText())
        assertEquals(friend, share.userId)
        assertEquals("Name $friend", share.displayName)
        assertEquals(owner, share.grantedBy)
        assertEquals("Name $owner", share.grantedByName)

        val listed = json.decodeFromString<List<ProjectShare>>(listShares(project, owner).bodyAsText())
        assertEquals(listOf(friend), listed.map { it.userId })

        assertEquals(HttpStatusCode.NoContent, revoke(project, friend, owner).status)
        assertEquals(HttpStatusCode.NotFound, revoke(project, friend, owner).status)
        assertTrue(json.decodeFromString<List<ProjectShare>>(listShares(project, owner).bodyAsText()).isEmpty())
    }

    @Test
    fun `adding a share twice keeps one share`() = testApplication {
        installTestApp()
        val (owner, friend, project) = seed("share-twice")

        val first = json.decodeFromString<ProjectShare>(share(project, friend, owner).bodyAsText())
        val second = json.decodeFromString<ProjectShare>(share(project, friend, owner).bodyAsText())
        assertEquals(first, second)
        assertEquals(1, json.decodeFromString<List<ProjectShare>>(listShares(project, owner).bodyAsText()).size)
    }

    @Test
    fun `only the owner manages shares`() = testApplication {
        installTestApp()
        val (owner, friend, project) = seed("share-owner-only")
        share(project, friend, owner)

        assertEquals(HttpStatusCode.Forbidden, listShares(project, friend).status)
        assertEquals(HttpStatusCode.Forbidden, share(project, friend, friend).status)
        assertEquals(HttpStatusCode.Forbidden, revoke(project, friend, friend).status)
    }

    @Test
    fun `a project not saved on the server cannot be shared`() = testApplication {
        installTestApp()
        insertUser("share-local-owner")
        insertUser("share-local-friend")

        assertEquals(HttpStatusCode.NotFound, share("share-local-only", "share-local-friend", "share-local-owner").status)
    }

    @Test
    fun `a flagged project cannot be shared`() = testApplication {
        installTestApp()
        val (owner, friend, project) = seed("share-flagged")
        flag(project)

        assertEquals(HttpStatusCode.Conflict, share(project, friend, owner).status)
    }

    @Test
    fun `the owner cannot share with themselves or an unknown user`() = testApplication {
        installTestApp()
        val (owner, _, project) = seed("share-invalid")

        assertEquals(HttpStatusCode.BadRequest, share(project, owner, owner).status)
        assertEquals(HttpStatusCode.BadRequest, share(project, "share-nobody", owner).status)
    }

    @Test
    fun `a shared user plays the project until the share is revoked`() = testApplication {
        installTestApp()
        val (owner, friend, project) = seed("share-play")
        assertEquals(HttpStatusCode.NotFound, playAs(project, friend).status)

        share(project, friend, owner)
        assertEquals(HttpStatusCode.OK, playAs(project, friend).status)

        revoke(project, friend, owner)
        assertEquals(HttpStatusCode.NotFound, playAs(project, friend).status)
    }

    @Test
    fun `a shared project that is flagged later fails to start`() = testApplication {
        installTestApp()
        val (owner, friend, project) = seed("share-play-flagged")
        share(project, friend, owner)
        flag(project)

        assertEquals(HttpStatusCode.Forbidden, playAs(project, friend).status)
    }

    @Test
    fun `scope shared lists the projects shared with the caller, newest first, with the author`() = testApplication {
        installTestApp()
        val (owner, friend, project) = seed("share-scope")
        projects.upsert(owner, makeProject("share-scope-newer", updatedAt = 2000L))
        projects.upsert(owner, makeProject("share-scope-unshared"))
        share(project, friend, owner)
        share("share-scope-newer", friend, owner)

        val shared = sharedWith(friend)
        assertEquals(listOf("share-scope-newer", project), shared.map { it.id })
        assertTrue(shared.all { it.authorName == "Name $owner" })

        val mine = json.decodeFromString<List<Project>>(
            client.get("/api/projects?scope=mine") { auth(friend) }.bodyAsText()
        )
        assertTrue(mine.isEmpty())
    }

    @Test
    fun `an unknown scope returns 400`() = testApplication {
        installTestApp()
        assertEquals(HttpStatusCode.BadRequest, client.get("/api/projects?scope=everyone") { auth("share-any") }.status)
    }

    @Test
    fun `deleting a project removes its shares`() = testApplication {
        installTestApp()
        val (owner, friend, project) = seed("share-deleted")
        share(project, friend, owner)

        projects.delete(owner, project)

        assertTrue(sharedWith(friend).isEmpty())
        assertEquals(false, shares.isSharedWith(project, friend))
    }
}
