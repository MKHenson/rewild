package com.rewild.db.tables

import org.jetbrains.exposed.sql.Table

object AssetCleanupQueueTable : Table("asset_cleanup_queue") {
    val id = text("id")
    val prefix = text("prefix").uniqueIndex()
    val attempts = integer("attempts").default(0)
    val lastError = text("last_error").nullable()
    val createdAt = long("created_at")
    val lastAttemptAt = long("last_attempt_at").nullable()

    override val primaryKey = PrimaryKey(id)
}
