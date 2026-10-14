package com.rewild.users

import com.rewild.auth.JwtService
import com.rewild.db.tables.UsersTable
import com.rewild.installTestAuth
import com.rewild.makeTestJwtService
import com.rewild.models.UserSummary
import com.rewild.startTestDatabase
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class UserRoutesTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var jwtService: JwtService
        private val json = Json { ignoreUnknownKeys = true }

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            jwtService = makeTestJwtService()
        }

        @AfterClass
        @JvmStatic
        fun teardown() {
            postgres.close()
        }

        private fun insertUser(id: String, displayName: String, email: String = "$id@test.com") = transaction {
            UsersTable.insert {
                it[UsersTable.id] = id
                it[UsersTable.email] = email
                it[UsersTable.displayName] = displayName
                it[photoUrl] = "https://photos/$id"
                it[createdAt] = System.currentTimeMillis()
            }
        }
    }

    private fun ApplicationTestBuilder.installTestApp() {
        installTestAuth(jwtService) { userRoutes(UserService()) }
    }

    private suspend fun ApplicationTestBuilder.search(q: String, as_: String = "search-caller"): HttpResponse =
        client.get("/api/users/search") {
            parameter("q", q)
            header(HttpHeaders.Authorization, "Bearer ${jwtService.generateToken(as_, "$as_@test.com", as_)}")
        }

    private suspend fun ApplicationTestBuilder.searchIds(q: String, as_: String = "search-caller") =
        json.decodeFromString<List<UserSummary>>(search(q, as_).bodyAsText()).map { it.id }

    @Test
    fun `request without token returns 401`() = testApplication {
        installTestApp()
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/users/search?q=ab").status)
    }

    @Test
    fun `matches a display name by prefix, ignoring case`() = testApplication {
        installTestApp()
        insertUser("search-prefix-a", "Zebulon Prefix")
        insertUser("search-prefix-b", "zebulon other")
        insertUser("search-prefix-c", "Not Zebulon")

        assertEquals(setOf("search-prefix-a", "search-prefix-b"), searchIds("ZEBULON").toSet())
        assertEquals(setOf("search-prefix-a", "search-prefix-b"), searchIds("zeb").toSet())
    }

    @Test
    fun `needs at least two characters`() = testApplication {
        installTestApp()
        insertUser("search-short", "Qx Short")

        assertTrue(searchIds("q").isEmpty())
        assertEquals(listOf("search-short"), searchIds("qx"))
    }

    @Test
    fun `matches an email only exactly and never returns an email`() = testApplication {
        installTestApp()
        insertUser("search-email", "Hidden Person", "Hidden.Person@Example.com")

        assertTrue(searchIds("hidden.person@").isEmpty())
        assertTrue(searchIds("example.com").isEmpty())
        assertEquals(listOf("search-email"), searchIds("hidden.person@example.com"))

        val body = search("hidden.person@example.com").bodyAsText()
        assertFalse(body.contains("example.com", ignoreCase = true))
        assertFalse(body.contains("\"email\""))
    }

    @Test
    fun `wildcards in the query are literal`() = testApplication {
        installTestApp()
        insertUser("search-wild", "Wildcard Person")

        assertTrue(searchIds("%ld").isEmpty())
        assertTrue(searchIds("W_ld").isEmpty())
    }

    @Test
    fun `leaves out the caller`() = testApplication {
        installTestApp()
        insertUser("search-self", "Selfie Caller")

        assertTrue(searchIds("selfie", as_ = "search-self").isEmpty())
        assertEquals(listOf("search-self"), searchIds("selfie"))
    }

    @Test
    fun `returns at most ten users`() = testApplication {
        installTestApp()
        repeat(12) { insertUser("search-many-$it", "Multitude $it") }

        assertEquals(USER_SEARCH_LIMIT, searchIds("multitude").size)
    }
}
