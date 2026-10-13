package com.rewild.projects

import com.rewild.assets.AssetCleanupService
import com.rewild.common.DeleteResult
import com.rewild.db.tables.LevelsTable
import com.rewild.db.tables.ProjectsTable
import com.rewild.db.tables.PublicGameTable
import com.rewild.models.Project
import com.rewild.models.SceneGraph
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.greater
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNull
import org.jetbrains.exposed.sql.transactions.transaction

private val json = Json { ignoreUnknownKeys = true }

class ProjectService(
    private val cleanup: AssetCleanupService? = null,
    private val bucketBaseUrl: String = ""
) {

    fun getAll(userId: String): List<Project> = transaction {
        ProjectsTable.selectAll()
            .where { (ProjectsTable.userId eq userId) and ProjectsTable.deletedAt.isNull() }
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
                it[startEvent] = record.startEvent
                it[sceneGraph] = json.encodeToString(record.sceneGraph)
                it[updatedAt] = record.updatedAt
                it[syncedAt] = record.syncedAt
                it[deletedAt] = record.deletedAt
                it[syncError] = record.syncError
            }
        } else {
            ProjectsTable.update({ ProjectsTable.id eq record.id }) {
                it[levelId] = record.levelId
                it[name] = record.name
                it[description] = record.description
                it[startEvent] = record.startEvent
                it[sceneGraph] = json.encodeToString(record.sceneGraph)
                it[updatedAt] = record.updatedAt
                it[syncedAt] = record.syncedAt
                it[deletedAt] = record.deletedAt
                it[syncError] = record.syncError
            }
        }

        record
    }

    fun getAllNewerThan(userId: String, since: Long): List<Project> = transaction {
        ProjectsTable.selectAll()
            .where { (ProjectsTable.userId eq userId) and (ProjectsTable.updatedAt greater since) }
            .map { it.toProject() }
    }

    // Tombstones the project and its levels, so the owner's other devices drop them on their
    // next sync, then removes every file under the project's prefix.
    fun delete(userId: String, id: String): DeleteResult {
        var levelIds = emptyList<String>()
        val result = transaction {
            val existing = ProjectsTable.selectAll()
                .where { ProjectsTable.id eq id }
                .firstOrNull()

            if (existing == null || existing[ProjectsTable.deletedAt] != null) return@transaction DeleteResult.NotFound
            if (existing[ProjectsTable.userId] != userId) return@transaction DeleteResult.Forbidden
            if (PublicGameTable.selectAll().where { PublicGameTable.projectId eq id }.any()) return@transaction DeleteResult.Conflict

            val now = System.currentTimeMillis()
            val liveLevels = (LevelsTable.projectId eq id) and LevelsTable.deletedAt.isNull()
            levelIds = LevelsTable.selectAll().where { liveLevels }.map { it[LevelsTable.id] }

            LevelsTable.update({ liveLevels }) {
                it[deletedAt] = now
                it[updatedAt] = now
                it[syncedAt] = now
            }
            ProjectsTable.update({ ProjectsTable.id eq id }) {
                it[deletedAt] = now
                it[updatedAt] = now
                it[syncedAt] = now
                it[imageKey] = null
            }
            DeleteResult.Success
        }

        // Only once the tombstones are committed: a rolled-back delete must not lose files.
        if (result == DeleteResult.Success) cleanup?.cleanupProject(userId, id, levelIds)
        return result
    }

    private fun ResultRow.toProject() = Project(
        id = this[ProjectsTable.id],
        userId = this[ProjectsTable.userId],
        levelId = this[ProjectsTable.levelId],
        name = this[ProjectsTable.name],
        description = this[ProjectsTable.description],
        startEvent = this[ProjectsTable.startEvent],
        sceneGraph = json.decodeFromString<SceneGraph>(this[ProjectsTable.sceneGraph]),
        updatedAt = this[ProjectsTable.updatedAt],
        syncedAt = this[ProjectsTable.syncedAt],
        deletedAt = this[ProjectsTable.deletedAt],
        syncError = this[ProjectsTable.syncError],
        imageUrl = this[ProjectsTable.imageKey]?.let { "$bucketBaseUrl/$it" }
    )
}
