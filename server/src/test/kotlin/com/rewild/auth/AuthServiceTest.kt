package com.rewild.auth

import com.rewild.makeTestJwtService
import com.rewild.startTestDatabase
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class AuthServiceTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var authService: AuthService

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            authService = AuthService(makeTestJwtService())
        }

        @AfterClass
        @JvmStatic
        fun teardown() {
            postgres.close()
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
