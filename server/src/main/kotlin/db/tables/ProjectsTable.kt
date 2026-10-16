package com.rewild.db.tables

import com.rewild.db.jsonb
import org.jetbrains.exposed.sql.Table

object ProjectsTable : Table("projects") {
    val id = text("id")
    val userId = text("user_id")
    val levelId = text("level_id").nullable()
    val name = text("name")
    val description = text("description")
    val updatedAt = long("updated_at")
    val syncedAt = long("synced_at")
    val syncError = text("sync_error").nullable()
    val deletedAt = long("deleted_at").nullable()
    val flaggedAt = long("flagged_at").nullable()
    val flaggedBy = text("flagged_by").nullable()

    override val primaryKey = PrimaryKey(id)
}
