package com.rewild.db.tables

import org.jetbrains.exposed.sql.Table

object RefreshTokensTable : Table("refresh_tokens") {
    val id = text("id")
    val userId = text("user_id").references(UsersTable.id)
    val token = text("token").uniqueIndex()
    val expiresAt = long("expires_at")
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(id)
}
