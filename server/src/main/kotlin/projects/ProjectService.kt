package com.rewild.projects

import com.rewild.common.DeleteResult
import com.rewild.db.tables.ProjectsTable
import com.rewild.models.Project
import com.rewild.models.SceneGraph
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction

private val json = Json { ignoreUnknownKeys = true }

class ProjectService {

    fun getAll(userId: String): List<Project> = transaction {
        ProjectsTable.selectAll()
            .where { ProjectsTable.userId eq userId }
            .map { it.toProject() }
    }

    fun getById(userId: String, id: String): Project? = transaction {
        ProjectsTable.selectAll()
            .where { (ProjectsTable.id eq id) and (ProjectsTable.userId eq userId) }
            .firstOrNull()
            ?.toProject()
    }

    // Returns null if the id is already owned by a different user.
    fun upsert(userId: String, project: Project): Project? = transaction {
        val existing = ProjectsTable.selectAll()
            .where { ProjectsTable.id eq project.id }
            .firstOrNull()

        if (existing != null && existing[ProjectsTable.userId] != userId) return@transaction null

        val record = project.copy(userId = userId)

        if (existing == null) {
            ProjectsTable.insert {
                it[id] = record.id
                it[ProjectsTable.userId] = userId
                it[levelId] = record.levelId
                it[name] = record.name
                it[description] = record.description
                it[activeOnStartup] = record.activeOnStartup
                it[startEvent] = record.startEvent
                it[sceneGraph] = json.encodeToString(record.sceneGraph)
                it[updatedAt] = record.updatedAt
                it[syncedAt] = record.syncedAt
                it[syncError] = record.syncError
            }
        } else {
            ProjectsTable.update({ ProjectsTable.id eq record.id }) {
                it[levelId] = record.levelId
                it[name] = record.name
                it[description] = record.description
                it[activeOnStartup] = record.activeOnStartup
                it[startEvent] = record.startEvent
                it[sceneGraph] = json.encodeToString(record.sceneGraph)
                it[updatedAt] = record.updatedAt
                it[syncedAt] = record.syncedAt
                it[syncError] = record.syncError
            }
        }

        record
    }

    fun delete(userId: String, id: String): DeleteResult = transaction {
        val existing = ProjectsTable.selectAll()
            .where { ProjectsTable.id eq id }
            .firstOrNull()
            ?: return@transaction DeleteResult.NotFound

        if (existing[ProjectsTable.userId] != userId) return@transaction DeleteResult.Forbidden

        ProjectsTable.deleteWhere { ProjectsTable.id eq id }
        DeleteResult.Success
    }

    private fun ResultRow.toProject() = Project(
        id = this[ProjectsTable.id],
        userId = this[ProjectsTable.userId],
        levelId = this[ProjectsTable.levelId],
        name = this[ProjectsTable.name],
        description = this[ProjectsTable.description],
        activeOnStartup = this[ProjectsTable.activeOnStartup],
        startEvent = this[ProjectsTable.startEvent],
        sceneGraph = json.decodeFromString<SceneGraph>(this[ProjectsTable.sceneGraph]),
        updatedAt = this[ProjectsTable.updatedAt],
        syncedAt = this[ProjectsTable.syncedAt],
        syncError = this[ProjectsTable.syncError]
    )
}
