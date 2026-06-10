package com.rewild.levels

import com.rewild.common.DeleteResult
import com.rewild.db.tables.LevelsTable
import com.rewild.models.Container
import com.rewild.models.Level
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.greater
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNull
import org.jetbrains.exposed.sql.transactions.transaction

private val json = Json { ignoreUnknownKeys = true }

class LevelService {

    fun getAll(userId: String): List<Level> = transaction {
        LevelsTable.selectAll()
            .where { (LevelsTable.userId eq userId) and LevelsTable.deletedAt.isNull() }
            .map { it.toLevel() }
    }

    fun getById(userId: String, id: String): Level? = transaction {
        LevelsTable.selectAll()
            .where { (LevelsTable.id eq id) and (LevelsTable.userId eq userId) }
            .firstOrNull()
            ?.toLevel()
    }

    // Returns null if the id is already owned by a different user.
    fun upsert(userId: String, level: Level): Level? = transaction {
        val existing = LevelsTable.selectAll()
            .where { LevelsTable.id eq level.id }
            .firstOrNull()

        if (existing != null && existing[LevelsTable.userId] != userId) return@transaction null

        val record = level.copy(userId = userId)

        if (existing == null) {
            LevelsTable.insert {
                it[id] = record.id
                it[LevelsTable.userId] = userId
                it[projectId] = record.projectId
                it[name] = record.name
                it[activeOnStartup] = record.activeOnStartup
                it[hasTerrain] = record.hasTerrain
                it[startEvent] = record.startEvent
                it[containers] = json.encodeToString(record.containers)
                it[updatedAt] = record.updatedAt
                it[syncedAt] = record.syncedAt
                it[deletedAt] = record.deletedAt
                it[syncError] = record.syncError
            }
        } else {
            LevelsTable.update({ LevelsTable.id eq record.id }) {
                it[projectId] = record.projectId
                it[name] = record.name
                it[activeOnStartup] = record.activeOnStartup
                it[hasTerrain] = record.hasTerrain
                it[startEvent] = record.startEvent
                it[containers] = json.encodeToString(record.containers)
                it[updatedAt] = record.updatedAt
                it[syncedAt] = record.syncedAt
                it[deletedAt] = record.deletedAt
                it[syncError] = record.syncError
            }
        }

        record
    }

    fun getAllNewerThan(userId: String, since: Long): List<Level> = transaction {
        LevelsTable.selectAll()
            .where { (LevelsTable.userId eq userId) and (LevelsTable.updatedAt greater since) }
            .map { it.toLevel() }
    }

    fun delete(userId: String, id: String): DeleteResult = transaction {
        val existing = LevelsTable.selectAll()
            .where { LevelsTable.id eq id }
            .firstOrNull()
            ?: return@transaction DeleteResult.NotFound

        if (existing[LevelsTable.userId] != userId) return@transaction DeleteResult.Forbidden

        LevelsTable.deleteWhere { LevelsTable.id eq id }
        DeleteResult.Success
    }

    private fun ResultRow.toLevel() = Level(
        id = this[LevelsTable.id],
        userId = this[LevelsTable.userId],
        projectId = this[LevelsTable.projectId],
        name = this[LevelsTable.name],
        activeOnStartup = this[LevelsTable.activeOnStartup],
        hasTerrain = this[LevelsTable.hasTerrain],
        startEvent = this[LevelsTable.startEvent],
        containers = json.decodeFromString<List<Container>>(this[LevelsTable.containers]),
        updatedAt = this[LevelsTable.updatedAt],
        syncedAt = this[LevelsTable.syncedAt],
        deletedAt = this[LevelsTable.deletedAt],
        syncError = this[LevelsTable.syncError]
    )
}
