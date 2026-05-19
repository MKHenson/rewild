package com.rewild.auth

import com.rewild.db.tables.PasswordResetTokensTable
import com.rewild.db.tables.UsersTable
import com.rewild.makeTestJwtService
import com.rewild.startTestDatabase
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
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

        private fun googleAuthService(
            verifier: (String) -> Map<String, String>?
        ) = AuthService(
            jwtService = makeTestJwtService(),
            googleTokenVerifierOverride = verifier
        )

        private fun fakeClaims(
            sub: String = "google-sub-123",
            email: String = "google@test.com",
            name: String = "Google User"
        ) = mapOf("sub" to sub, "email" to email, "name" to name)
    }

    // ── register ─────────────────────────────────────────────────────────────

    @Test
    fun `register returns token pair`() {
        val result = authService.register("register@test.com", "password123", "Register User")
        assertNotNull(result)
        assert(result!!.accessToken.isNotEmpty())
        assert(result.refreshToken.isNotEmpty())
    }

    @Test
    fun `register with duplicate email returns null`() {
        authService.register("dup@test.com", "password123", "Dup User")
        val result = authService.register("dup@test.com", "password123", "Dup User")
        assertNull(result)
    }

    // ── login ─────────────────────────────────────────────────────────────────

    @Test
    fun `login with valid credentials returns token pair`() {
        authService.register("login@test.com", "password123", "Login User")
        val result = authService.login("login@test.com", "password123")
        assertNotNull(result)
    }

    @Test
    fun `login with wrong password returns null`() {
        authService.register("wrongpw@test.com", "password123", "WrongPw User")
        val result = authService.login("wrongpw@test.com", "wrongpassword")
        assertNull(result)
    }

    @Test
    fun `login with unknown email returns null`() {
        val result = authService.login("nobody@test.com", "password123")
        assertNull(result)
    }

    @Test
    fun `login returns null for Google-only account with no password`() {
        val svc = googleAuthService { fakeClaims(email = "google-only-login@test.com") }
        svc.googleAuth("token")
        val result = svc.login("google-only-login@test.com", "anypassword")
        assertNull(result)
    }

    // ── refresh ───────────────────────────────────────────────────────────────

    @Test
    fun `refresh with valid token returns new token pair`() {
        val initial = authService.register("refresh@test.com", "password123", "Refresh User")!!
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
    fun `refresh token rotation invalidates old token`() {
        val initial = authService.register("rotate@test.com", "password123", "Rotate User")!!
        authService.refresh(initial.refreshToken)
        val result = authService.refresh(initial.refreshToken)
        assertNull(result)
    }

    // ── revoke ────────────────────────────────────────────────────────────────

    @Test
    fun `revoke removes refresh token`() {
        val tokens = authService.register("revoke@test.com", "password123", "Revoke User")!!
        authService.revoke(tokens.refreshToken)
        val result = authService.refresh(tokens.refreshToken)
        assertNull(result)
    }

    // ── forgotPassword ────────────────────────────────────────────────────────

    @Test
    fun `forgotPassword does not throw for unknown email`() {
        authService.forgotPassword("unknown-forgot@test.com")
    }

    @Test
    fun `forgotPassword does not throw for known email without email service`() {
        authService.register("forgot@test.com", "password123", "Forgot User")
        authService.forgotPassword("forgot@test.com")
    }

    // ── resetPassword ─────────────────────────────────────────────────────────

    @Test
    fun `resetPassword with invalid token returns null`() {
        val result = authService.resetPassword("not-a-real-reset-token", "newpassword")
        assertNull(result)
    }

    @Test
    fun `resetPassword with valid token returns token pair and allows login with new password`() {
        authService.register("reset@test.com", "oldpassword", "Reset User")
        authService.forgotPassword("reset@test.com")

        val resetToken = getResetTokenForEmail("reset@test.com")
        assertNotNull(resetToken)

        val result = authService.resetPassword(resetToken!!, "newpassword")
        assertNotNull(result)

        val loginResult = authService.login("reset@test.com", "newpassword")
        assertNotNull(loginResult)
    }

    @Test
    fun `resetPassword invalidates old password`() {
        authService.register("reset-old@test.com", "oldpassword", "Reset Old User")
        authService.forgotPassword("reset-old@test.com")

        val resetToken = getResetTokenForEmail("reset-old@test.com")!!
        authService.resetPassword(resetToken, "newpassword")

        val loginWithOld = authService.login("reset-old@test.com", "oldpassword")
        assertNull(loginWithOld)
    }

    @Test
    fun `resetPassword invalidates all existing refresh tokens`() {
        val tokens = authService.register("reset-refresh@test.com", "oldpassword", "Reset Refresh User")!!
        authService.forgotPassword("reset-refresh@test.com")

        val resetToken = getResetTokenForEmail("reset-refresh@test.com")!!
        authService.resetPassword(resetToken, "newpassword")

        val refreshResult = authService.refresh(tokens.refreshToken)
        assertNull(refreshResult)
    }

    @Test
    fun `resetPassword token can only be used once`() {
        authService.register("reset-once@test.com", "oldpassword", "Reset Once User")
        authService.forgotPassword("reset-once@test.com")

        val resetToken = getResetTokenForEmail("reset-once@test.com")!!
        authService.resetPassword(resetToken, "newpassword1")
        val secondReset = authService.resetPassword(resetToken, "newpassword2")
        assertNull(secondReset)
    }

    // ── googleAuth ────────────────────────────────────────────────────────────

    @Test
    fun `googleAuth returns token pair for valid claims`() {
        val svc = googleAuthService { fakeClaims(email = "new-google@test.com") }
        val result = svc.googleAuth("any-token")
        assertNotNull(result)
        assert(result!!.accessToken.isNotEmpty())
        assert(result.refreshToken.isNotEmpty())
    }

    @Test
    fun `googleAuth returns null when verifier returns null`() {
        val svc = googleAuthService { null }
        val result = svc.googleAuth("bad-token")
        assertNull(result)
    }

    @Test
    fun `googleAuth returns token pair for existing Google user`() {
        val svc = googleAuthService { fakeClaims(sub = "sub-existing", email = "existing-google@test.com") }
        svc.googleAuth("token")
        val result = svc.googleAuth("token")
        assertNotNull(result)
    }

    @Test
    fun `googleAuth issues different refresh tokens on each sign-in`() {
        val svc = googleAuthService { fakeClaims(sub = "sub-multi", email = "multi-google@test.com") }
        val first = svc.googleAuth("token")!!
        val second = svc.googleAuth("token")!!
        assertNotEquals(first.refreshToken, second.refreshToken)
    }

    @Test
    fun `googleAuth auto-links existing email-password account by email`() {
        val svc = googleAuthService { fakeClaims(sub = "sub-link", email = "link@test.com") }
        authService.register("link@test.com", "password123", "Link User")

        val result = svc.googleAuth("token")
        assertNotNull(result)

        // Original password login should still work after linking
        val loginResult = authService.login("link@test.com", "password123")
        assertNotNull(loginResult)
    }

    @Test
    fun `googleAuth creates user with display name from Google claims`() {
        val svc = googleAuthService { fakeClaims(sub = "sub-name", email = "named-google@test.com", name = "Jane Doe") }
        val result = svc.googleAuth("token")
        assertNotNull(result)
        val decoded = decodeJwtClaim(result!!.accessToken, "displayName")
        assertEquals("Jane Doe", decoded)
    }

    @Test
    fun `googleAuth falls back to email as display name when name claim is absent`() {
        val svc = googleAuthService { mapOf("sub" to "sub-noname", "email" to "noname-google@test.com") }
        val result = svc.googleAuth("token")
        assertNotNull(result)
        val decoded = decodeJwtClaim(result!!.accessToken, "displayName")
        assertEquals("noname-google@test.com", decoded)
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private fun getResetTokenForEmail(email: String): String? {
        return transaction {
            val user = UsersTable.selectAll()
                .where { UsersTable.email eq email }
                .firstOrNull() ?: return@transaction null
            PasswordResetTokensTable.selectAll()
                .where { PasswordResetTokensTable.userId eq user[UsersTable.id] }
                .firstOrNull()
                ?.get(PasswordResetTokensTable.token)
        }
    }

    private fun decodeJwtClaim(token: String, claim: String): String? {
        val payload = token.split(".")[1]
            .let { java.util.Base64.getUrlDecoder().decode(it) }
            .let { String(it) }
        val match = Regex(""""$claim"\s*:\s*"([^"]+)"""").find(payload)
        return match?.groupValues?.get(1)
    }
}
