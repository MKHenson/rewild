package com.rewild.db.tables

import org.jetbrains.exposed.sql.Table

object UsersTable : Table("users") {
    val id = text("id")
    val email = text("email").uniqueIndex()
    val passwordHash = text("password_hash").nullable()
    val displayName = text("display_name")
    val googleId = text("google_id").nullable().uniqueIndex()
    val photoUrl = text("photo_url").nullable()
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(id)
}
