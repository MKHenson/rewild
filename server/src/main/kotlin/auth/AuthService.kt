package com.rewild.auth

import at.favre.lib.crypto.bcrypt.BCrypt
import com.rewild.db.tables.PasswordResetTokensTable
import com.rewild.db.tables.RefreshTokensTable
import com.rewild.db.tables.UsersTable
import com.rewild.email.EmailService
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import org.slf4j.LoggerFactory
import java.time.Instant
import java.util.UUID

class AuthService(
    private val jwtService: JwtService,
    private val emailService: EmailService? = null,
    private val appUrl: String = "",
) {
    private val log = LoggerFactory.getLogger(AuthService::class.java)

    data class TokenPair(val accessToken: String, val refreshToken: String)

    fun register(email: String, password: String, username: String): TokenPair? {
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
                it[UsersTable.username] = username
                it[passwordHash] = hash
                it[createdAt] = now
            }
        }

        return issueTokenPair(userId, email, username)
    }

    fun login(email: String, password: String): TokenPair? {
        val user = transaction {
            UsersTable.selectAll().where { UsersTable.email eq email }.firstOrNull()
        } ?: return null

        val result = BCrypt.verifyer().verify(password.toCharArray(), user[UsersTable.passwordHash])
        if (!result.verified) return null

        return issueTokenPair(user[UsersTable.id], email, user[UsersTable.username])
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
        val username = row[UsersTable.username]

        transaction {
            RefreshTokensTable.deleteWhere { RefreshTokensTable.token eq token }
        }

        return issueTokenPair(userId, email, username)
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

        return issueTokenPair(userId, user[UsersTable.email], user[UsersTable.username])
    }

    private fun issueTokenPair(userId: String, email: String, username: String): TokenPair {
        val accessToken = jwtService.generateToken(userId, email, username)
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

    companion object {
        private val REFRESH_TOKEN_EXPIRY_MS = 30L * 24 * 60 * 60 * 1000
        private val RESET_TOKEN_EXPIRY_MS = 60L * 60 * 1000
    }
}
