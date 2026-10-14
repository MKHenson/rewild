package com.rewild.db.tables

import org.jetbrains.exposed.sql.Table

object ProjectSharesTable : Table("project_shares") {
    val projectId = text("project_id")
    val userId = text("user_id")
    val grantedBy = text("granted_by")
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(projectId, userId)
}
