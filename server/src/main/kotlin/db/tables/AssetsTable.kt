package com.rewild.db.tables

import org.jetbrains.exposed.sql.Table

object AssetsTable : Table("assets") {
    val id = text("id")
    val userId = text("user_id")
    val levelId = text("level_id")
    val assetType = text("asset_type")
    val filename = text("filename")
    val storageKey = text("storage_key")
    val confirmed = bool("confirmed").default(false)
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(id)
}
