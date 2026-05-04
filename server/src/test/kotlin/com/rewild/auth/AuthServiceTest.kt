package com.rewild.auth

import com.rewild.db.tables.RefreshTokensTable
import com.rewild.db.tables.UsersTable
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.sql.Database
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import org.testcontainers.containers.PostgreSQLContainer
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class AuthServiceTest {

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16")
        private lateinit var authService: AuthService

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres.start()

            Flyway.configure()
                .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .load()
                .migrate()

            val hikari = HikariConfig().apply {
                jdbcUrl = postgres.jdbcUrl
                username = postgres.username
                password = postgres.password
                driverClassName = "org.postgresql.Driver"
                maximumPoolSize = 5
            }
            Database.connect(HikariDataSource(hikari))

            val jwtService = JwtService(
                secret = "test-secret-1234567890",
                issuer = "http://localhost",
                audience = "rewild-api"
            )
            authService = AuthService(jwtService)
        }

        @AfterClass
        @JvmStatic
        fun teardown() {
            postgres.stop()
        }
    }

    @Test
    fun `register returns token pair`() {
        val result = authService.register("register@test.com", "password123")
        assertNotNull(result)
        assert(result!!.accessToken.isNotEmpty())
        assert(result.refreshToken.isNotEmpty())
    }

    @Test
    fun `register with duplicate email returns null`() {
        authService.register("dup@test.com", "password123")
        val result = authService.register("dup@test.com", "password123")
        assertNull(result)
    }

    @Test
    fun `login with valid credentials returns token pair`() {
        authService.register("login@test.com", "password123")
        val result = authService.login("login@test.com", "password123")
        assertNotNull(result)
    }

    @Test
    fun `login with wrong password returns null`() {
        authService.register("wrongpw@test.com", "password123")
        val result = authService.login("wrongpw@test.com", "wrongpassword")
        assertNull(result)
    }

    @Test
    fun `login with unknown email returns null`() {
        val result = authService.login("nobody@test.com", "password123")
        assertNull(result)
    }

    @Test
    fun `refresh with valid token returns new token pair`() {
        val initial = authService.register("refresh@test.com", "password123")!!
        val refreshed = authService.refresh(initial.refreshToken)
        assertNotNull(refreshed)
        assertNotEquals(initial.refreshToken, refreshed!!.refreshToken)
    }

    @Test
    fun `refresh with invalid token returns null`() {
        val result = authService.refresh("not-a-real-token")
        assertNull(result)
    }

    @Test
    fun `revoke removes refresh token`() {
        val tokens = authService.register("revoke@test.com", "password123")!!
        authService.revoke(tokens.refreshToken)
        val result = authService.refresh(tokens.refreshToken)
        assertNull(result)
    }

    @Test
    fun `refresh token rotation invalidates old token`() {
        val initial = authService.register("rotate@test.com", "password123")!!
        authService.refresh(initial.refreshToken)
        val result = authService.refresh(initial.refreshToken)
        assertNull(result)
    }
}
