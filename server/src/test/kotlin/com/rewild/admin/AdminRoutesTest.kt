package com.rewild.admin

import com.rewild.auth.AuthService
import com.rewild.auth.JwtService
import com.rewild.auth.UserRole
import com.rewild.db.tables.ProjectsTable
import com.rewild.db.tables.UsersTable
import com.rewild.installTestAuth
import com.rewild.publicgame.PublicGameService
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
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
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
            service = AdminService(AuthService(jwtService), "https://cdn")
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
        installTestAuth(jwtService) {
            adminRoutes(service)
            projectFlagRoutes(service)
        }
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

    private fun insertProject(
        id: String,
        userId: String,
        updatedAt: Long,
        deletedAt: Long? = null,
        name: String = "Project $id"
    ) = transaction {
        ProjectsTable.insert {
            it[ProjectsTable.id] = id
            it[ProjectsTable.userId] = userId
            it[ProjectsTable.name] = name
            it[description] = "About $id"
            it[startEvent] = ""
            it[sceneGraph] = "{}"
            it[imageKey] = "users/$userId/projects/$id/image/cover.png"
            it[ProjectsTable.updatedAt] = updatedAt
            it[ProjectsTable.deletedAt] = deletedAt
        }
    }

    @Test
    fun `super admin lists live projects of all users, newest first`() = testApplication {
        installTestApp()
        insertUser("admin-projects", UserRole.SUPER_ADMIN)
        insertUser("admin-projects-author")
        insertProject("admin-old-proj", "admin-projects-author", updatedAt = 5_000_000_000_000)
        insertProject("admin-new-proj", "admin-projects", updatedAt = 5_000_000_000_001)
        insertProject("admin-gone-proj", "admin-projects-author", updatedAt = 5_000_000_000_002, deletedAt = 1)

        val response = client.get("/api/admin/projects") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-projects")}")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val projects = json.decodeFromString<AdminProjectPage>(response.bodyAsText()).items
        assertEquals(listOf("admin-new-proj", "admin-old-proj"), projects.take(2).map { it.id })
        assertEquals("admin-projects-author", projects[1].authorName)
        assertEquals("About admin-old-proj", projects[1].description)
        assertEquals("https://cdn/users/admin-projects-author/projects/admin-old-proj/image/cover.png", projects[1].imageUrl)
        assertTrue(projects.none { it.id == "admin-gone-proj" })
    }

    private suspend fun ApplicationTestBuilder.listProjects(query: String, as_: String = "admin-pager") =
        json.decodeFromString<AdminProjectPage>(
            client.get("/api/admin/projects?$query") {
                header(HttpHeaders.Authorization, "Bearer ${tokenFor(as_)}")
            }.bodyAsText()
        )

    @Test
    fun `projects come in pages with a total`() = testApplication {
        installTestApp()
        insertUser("admin-pager", UserRole.SUPER_ADMIN)
        insertProject("pager-1", "admin-pager", updatedAt = 7_000_000_000_003)
        insertProject("pager-2", "admin-pager", updatedAt = 7_000_000_000_002)
        insertProject("pager-3", "admin-pager", updatedAt = 7_000_000_000_001)

        val first = listProjects("pageSize=2&page=0")
        val second = listProjects("pageSize=2&page=1")

        assertEquals(listOf("pager-1", "pager-2"), first.items.map { it.id })
        assertEquals("pager-3", second.items.first().id)
        assertTrue(first.total >= 3)
        assertEquals(first.total, second.total)
    }

    @Test
    fun `projects sort by name, author and flag state`() = testApplication {
        installTestApp()
        insertUser("admin-sorter", UserRole.SUPER_ADMIN)
        insertUser("aaa-author")
        insertProject("sort-b", "admin-sorter", updatedAt = 1, name = "AAA b")
        insertProject("sort-a", "aaa-author", updatedAt = 2, name = "aaa a")
        service.flagProject("admin-sorter", "sort-b")

        val byName = listProjects("sort=name&order=asc", "admin-sorter").items.map { it.id }
        val byAuthor = listProjects("sort=author&order=asc", "admin-sorter").items.map { it.id }
        val flaggedFirst = listProjects("sort=flagged&order=desc&pageSize=100", "admin-sorter").items
        val flaggedLast = listProjects("sort=flagged&order=asc&pageSize=100", "admin-sorter").items

        assertEquals(listOf("sort-a", "sort-b"), byName.take(2))
        assertEquals("sort-a", byAuthor.first())
        assertNotNull(flaggedFirst.first().flaggedAt)
        assertTrue(flaggedFirst.dropWhile { it.flaggedAt != null }.all { it.flaggedAt == null })
        assertNull(flaggedLast.first().flaggedAt)
        assertTrue(flaggedLast.dropWhile { it.flaggedAt == null }.all { it.flaggedAt != null })
    }

    @Test
    fun `unknown sort is rejected`() = testApplication {
        installTestApp()
        insertUser("admin-bad-sort", UserRole.SUPER_ADMIN)
        val response = client.get("/api/admin/projects?sort=size") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-bad-sort")}")
        }
        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    private fun flaggedBy(id: String) = transaction {
        ProjectsTable.selectAll().where { ProjectsTable.id eq id }.single()[ProjectsTable.flaggedBy]
    }

    @Test
    fun `super admin flags and unflags a project`() = testApplication {
        installTestApp()
        insertUser("admin-flagger", UserRole.SUPER_ADMIN)
        insertProject("flag-me", "admin-flagger", updatedAt = 1)

        val flag = client.post("/api/projects/flag-me/flag") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-flagger")}")
        }
        assertEquals(HttpStatusCode.NoContent, flag.status)
        assertEquals("admin-flagger", flaggedBy("flag-me"))

        val unflag = client.delete("/api/projects/flag-me/flag") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-flagger")}")
        }
        assertEquals(HttpStatusCode.NoContent, unflag.status)
        assertNull(flaggedBy("flag-me"))
    }

    @Test
    fun `flagging is super admin only`() = testApplication {
        installTestApp()
        insertUser("flag-regular")
        insertProject("flag-own", "flag-regular", updatedAt = 1)

        val response = client.post("/api/projects/flag-own/flag") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("flag-regular")}")
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
        assertNull(flaggedBy("flag-own"))
    }

    @Test
    fun `the public game and missing projects cannot be flagged`() = testApplication {
        installTestApp()
        insertUser("admin-public-flag", UserRole.SUPER_ADMIN)
        insertProject("flag-public", "admin-public-flag", updatedAt = 1)
        val publicGame = PublicGameService()
        publicGame.set("flag-public")

        try {
            val public = client.post("/api/projects/flag-public/flag") {
                header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-public-flag")}")
            }
            assertEquals(HttpStatusCode.Conflict, public.status)
            assertNull(flaggedBy("flag-public"))
        } finally {
            publicGame.set(null)
        }

        val missing = client.post("/api/projects/flag-nothing/flag") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-public-flag")}")
        }
        assertEquals(HttpStatusCode.NotFound, missing.status)
    }

    @Test
    fun `regular user cannot list projects`() = testApplication {
        installTestApp()
        insertUser("admin-projects-regular")
        val response = client.get("/api/admin/projects") {
            header(HttpHeaders.Authorization, "Bearer ${tokenFor("admin-projects-regular")}")
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
    }
}
