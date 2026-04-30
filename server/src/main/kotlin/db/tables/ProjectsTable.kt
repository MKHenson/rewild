package com.rewild.db.tables

import com.rewild.db.jsonb
import org.jetbrains.exposed.sql.Table

object ProjectsTable : Table("projects") {
    val id = text("id")
    val userId = text("user_id")
    val levelId = text("level_id").nullable()
    val name = text("name")
    val description = text("description")
    val activeOnStartup = bool("active_on_startup")
    val startEvent = text("start_event")
    val sceneGraph = jsonb("scene_graph")
    val updatedAt = long("updated_at")
    val syncedAt = long("synced_at")
    val syncError = text("sync_error").nullable()

    override val primaryKey = PrimaryKey(id)
}
