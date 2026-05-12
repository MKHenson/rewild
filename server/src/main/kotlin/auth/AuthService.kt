package com.rewild.auth

import at.favre.lib.crypto.bcrypt.BCrypt
import com.rewild.db.tables.RefreshTokensTable
import com.rewild.db.tables.UsersTable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.Instant
import java.util.UUID

class AuthService(private val jwtService: JwtService) {

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
    }
}
