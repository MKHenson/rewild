package com.rewild.auth

import at.favre.lib.crypto.bcrypt.BCrypt
import com.rewild.db.tables.PasswordResetTokensTable
import com.rewild.db.tables.RefreshTokensTable
import com.rewild.db.tables.UsersTable
import com.rewild.email.EmailService
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import org.slf4j.LoggerFactory
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Instant
import java.util.UUID

class AuthService(
    private val jwtService: JwtService,
    private val emailService: EmailService? = null,
    private val appUrl: String = "",
    private val googleClientId: String = "",
    private val googleTokenVerifierOverride: ((String) -> Map<String, String>?)? = null,
) {
    private val log = LoggerFactory.getLogger(AuthService::class.java)
    private val httpClient = HttpClient.newHttpClient()

    data class TokenPair(val accessToken: String, val refreshToken: String)

    fun register(email: String, password: String, displayName: String): TokenPair? {
        val exists = transaction {
            UsersTable.selectAll().where { UsersTable.email eq email }.count() > 0
        }
        if (exists) return null

        val userId = UUID.randomUUID().toString()
        val hash = BCrypt.withDefaults().hashToString(12, password.toCharArray())
        val now = Instant.now().toEpochMilli()

        transaction {
            UsersTable.insert {
                it[id] = userId
                it[UsersTable.email] = email
                it[UsersTable.displayName] = displayName
                it[passwordHash] = hash
                it[createdAt] = now
            }
        }

        return issueTokenPair(userId, email, displayName)
    }

    fun login(email: String, password: String): TokenPair? {
        val user = transaction {
            UsersTable.selectAll().where { UsersTable.email eq email }.firstOrNull()
        } ?: return null

        val hash = user[UsersTable.passwordHash] ?: return null
        val result = BCrypt.verifyer().verify(password.toCharArray(), hash)
        if (!result.verified) return null

        return issueTokenPair(user[UsersTable.id], email, user[UsersTable.displayName])
    }

    fun googleAuth(idToken: String): TokenPair? {
        val claims = (googleTokenVerifierOverride ?: ::verifyGoogleToken)(idToken) ?: return null

        val googleId = claims["sub"] ?: return null
        val email = claims["email"] ?: return null
        val displayName = claims["name"] ?: email
        val photoUrl = claims["picture"]
        val now = Instant.now().toEpochMilli()

        data class ResolvedUser(val id: String, val displayName: String, val photoUrl: String?)

        val resolved = transaction {
            val byGoogleId = UsersTable.selectAll()
                .where { UsersTable.googleId eq googleId }
                .firstOrNull()

            if (byGoogleId != null) {
                // Update photo on every sign-in in case it changed
                if (photoUrl != null) {
                    UsersTable.update({ UsersTable.id eq byGoogleId[UsersTable.id] }) {
                        it[UsersTable.photoUrl] = photoUrl
                    }
                }
                ResolvedUser(byGoogleId[UsersTable.id], byGoogleId[UsersTable.displayName], photoUrl)
            } else {
                val byEmail = UsersTable.selectAll()
                    .where { UsersTable.email eq email }
                    .firstOrNull()

                if (byEmail != null) {
                    // Auto-link existing email/password account
                    UsersTable.update({ UsersTable.id eq byEmail[UsersTable.id] }) {
                        it[UsersTable.googleId] = googleId
                        it[UsersTable.photoUrl] = photoUrl
                    }
                    ResolvedUser(byEmail[UsersTable.id], byEmail[UsersTable.displayName], photoUrl)
                } else {
                    val newId = UUID.randomUUID().toString()
                    UsersTable.insert {
                        it[id] = newId
                        it[UsersTable.email] = email
                        it[UsersTable.displayName] = displayName
                        it[UsersTable.googleId] = googleId
                        it[UsersTable.photoUrl] = photoUrl
                        it[createdAt] = now
                    }
                    ResolvedUser(newId, displayName, photoUrl)
                }
            }
        }

        return issueTokenPair(resolved.id, email, resolved.displayName, resolved.photoUrl)
    }

    fun refresh(token: String): TokenPair? {
        val now = Instant.now().toEpochMilli()

        val row = transaction {
            RefreshTokensTable
                .join(UsersTable, JoinType.INNER, RefreshTokensTable.userId, UsersTable.id)
                .selectAll()
                .where {
                    (RefreshTokensTable.token eq token) and
                    (RefreshTokensTable.expiresAt greater now)
                }
                .firstOrNull()
        } ?: return null

        val userId = row[RefreshTokensTable.userId]
        val email = row[UsersTable.email]
        val displayName = row[UsersTable.displayName]
        val photoUrl = row[UsersTable.photoUrl]

        transaction {
            RefreshTokensTable.deleteWhere { RefreshTokensTable.token eq token }
        }

        return issueTokenPair(userId, email, displayName, photoUrl)
    }

    fun revoke(token: String) {
        transaction {
            RefreshTokensTable.deleteWhere { RefreshTokensTable.token eq token }
        }
    }

    fun forgotPassword(email: String) {
        val user = transaction {
            UsersTable.selectAll().where { UsersTable.email eq email }.firstOrNull()
        } ?: return

        val token = UUID.randomUUID().toString()
        val now = Instant.now().toEpochMilli()

        transaction {
            PasswordResetTokensTable.deleteWhere { PasswordResetTokensTable.userId eq user[UsersTable.id] }
            PasswordResetTokensTable.insert {
                it[id] = UUID.randomUUID().toString()
                it[userId] = user[UsersTable.id]
                it[PasswordResetTokensTable.token] = token
                it[expiresAt] = now + RESET_TOKEN_EXPIRY_MS
                it[createdAt] = now
            }
        }

        try {
            val resetUrl = "$appUrl/reset-password?token=$token"
            emailService?.sendPasswordReset(email, resetUrl)
        } catch (e: Exception) {
            log.error("Failed to send password reset email to {}: {}", email, e.message)
        }
    }

    fun resetPassword(token: String, newPassword: String): TokenPair? {
        val now = Instant.now().toEpochMilli()

        val row = transaction {
            PasswordResetTokensTable.selectAll()
                .where {
                    (PasswordResetTokensTable.token eq token) and
                    (PasswordResetTokensTable.expiresAt greater now)
                }
                .firstOrNull()
        } ?: return null

        val userId = row[PasswordResetTokensTable.userId]
        val hash = BCrypt.withDefaults().hashToString(12, newPassword.toCharArray())

        val user = transaction {
            UsersTable.update({ UsersTable.id eq userId }) { it[passwordHash] = hash }
            PasswordResetTokensTable.deleteWhere { PasswordResetTokensTable.token eq token }
            RefreshTokensTable.deleteWhere { RefreshTokensTable.userId eq userId }
            UsersTable.selectAll().where { UsersTable.id eq userId }.firstOrNull()
        } ?: return null

        return issueTokenPair(userId, user[UsersTable.email], user[UsersTable.displayName])
    }

    private fun issueTokenPair(userId: String, email: String, displayName: String, photoUrl: String? = null): TokenPair {
        val accessToken = jwtService.generateToken(userId, email, displayName, photoUrl)
        val refreshToken = UUID.randomUUID().toString()
        val now = Instant.now().toEpochMilli()

        transaction {
            RefreshTokensTable.insert {
                it[id] = UUID.randomUUID().toString()
                it[RefreshTokensTable.userId] = userId
                it[RefreshTokensTable.token] = refreshToken
                it[expiresAt] = now + REFRESH_TOKEN_EXPIRY_MS
                it[createdAt] = now
            }
        }

        return TokenPair(accessToken, refreshToken)
    }

    private fun verifyGoogleToken(idToken: String): Map<String, String>? {
        return try {
            val request = HttpRequest.newBuilder()
                .uri(URI.create("https://oauth2.googleapis.com/tokeninfo?id_token=$idToken"))
                .GET()
                .build()
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() != 200) return null

            val json = Json.parseToJsonElement(response.body()).jsonObject
            val aud = json["aud"]?.jsonPrimitive?.content ?: return null
            if (aud != googleClientId) return null

            json.mapValues { it.value.jsonPrimitive.content }
        } catch (e: Exception) {
            log.error("Google token verification failed: {}", e.message)
            null
        }
    }

    companion object {
        private val REFRESH_TOKEN_EXPIRY_MS = 30L * 24 * 60 * 60 * 1000
        private val RESET_TOKEN_EXPIRY_MS = 60L * 60 * 1000
    }
}
