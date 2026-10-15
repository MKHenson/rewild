package com.rewild.db.tables

import org.jetbrains.exposed.sql.Table

object AssetsTable : Table("assets") {
    val id = text("id")
    val userId = text("user_id")
    val projectId = text("project_id")
    val levelId = text("level_id").nullable()
    val assetType = text("asset_type")
    val filename = text("filename")
    val storageKey = text("storage_key")
    val contentType = text("content_type").default("application/octet-stream")
    val confirmed = bool("confirmed").default(false)
    val createdAt = long("created_at")
    val updatedAt = long("updated_at").default(0)

    override val primaryKey = PrimaryKey(id)
}
