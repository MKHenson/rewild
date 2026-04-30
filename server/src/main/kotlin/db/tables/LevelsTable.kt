package com.rewild.db.tables

import com.rewild.db.jsonb
import org.jetbrains.exposed.sql.Table

object LevelsTable : Table("levels") {
    val id = text("id")
    val userId = text("user_id")
    val projectId = text("project_id")
    val name = text("name")
    val activeOnStartup = bool("active_on_startup")
    val hasTerrain = bool("has_terrain")
    val startEvent = text("start_event")
    val containers = jsonb("containers")
    val updatedAt = long("updated_at")
    val syncedAt = long("synced_at")
    val syncError = text("sync_error").nullable()

    override val primaryKey = PrimaryKey(id)
}
