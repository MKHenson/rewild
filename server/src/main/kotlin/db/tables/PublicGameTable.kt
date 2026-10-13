package com.rewild.db.tables

import org.jetbrains.exposed.sql.Table

object PublicGameTable : Table("public_game") {
    val id = integer("id")
    val projectId = text("project_id").nullable()

    override val primaryKey = PrimaryKey(id)
}
