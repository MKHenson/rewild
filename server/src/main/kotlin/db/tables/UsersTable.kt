package com.rewild.db.tables

import org.jetbrains.exposed.sql.Table

object UsersTable : Table("users") {
    val id = text("id")
    val email = text("email").uniqueIndex()
    val passwordHash = text("password_hash")
    val username = text("username")
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(id)
}
