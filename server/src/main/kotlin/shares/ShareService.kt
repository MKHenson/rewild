package com.rewild.shares

import com.rewild.db.tables.ProjectSharesTable
import com.rewild.db.tables.ProjectsTable
import com.rewild.db.tables.UsersTable
import com.rewild.models.ProjectShare
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNull
import org.jetbrains.exposed.sql.transactions.transaction

sealed interface ShareResult<out T> {
    data class Success<T>(val value: T) : ShareResult<T>
    data class Invalid(val message: String) : ShareResult<Nothing>
    data object NotFound : ShareResult<Nothing>
    data object Forbidden : ShareResult<Nothing>
    data object Flagged : ShareResult<Nothing>
}

class ShareService {

    fun list(ownerId: String, projectId: String): ShareResult<List<ProjectShare>> = transaction {
        ownerCheck(ownerId, projectId)?.let { return@transaction it }
        ShareResult.Success(shares(ProjectSharesTable.projectId eq projectId))
    }

    /** Gives [userId] play access. Adding an existing share returns it unchanged. */
    fun add(ownerId: String, projectId: String, userId: String): ShareResult<ProjectShare> = transaction {
        ownerCheck(ownerId, projectId)?.let { return@transaction it }
        if (liveProject(projectId)!![ProjectsTable.flaggedAt] != null) return@transaction ShareResult.Flagged
        if (userId == ownerId) return@transaction ShareResult.Invalid("You cannot share a project with yourself")
        if (UsersTable.selectAll().where { UsersTable.id eq userId }.empty())
            return@transaction ShareResult.Invalid("The user does not exist")

        ProjectSharesTable.insertIgnore {
            it[ProjectSharesTable.projectId] = projectId
            it[ProjectSharesTable.userId] = userId
            it[grantedBy] = ownerId
            it[createdAt] = System.currentTimeMillis()
        }
        ShareResult.Success(shares(pair(projectId, userId)).single())
    }

    fun revoke(ownerId: String, projectId: String, userId: String): ShareResult<Unit> = transaction {
        ownerCheck(ownerId, projectId)?.let { return@transaction it }
        if (ProjectSharesTable.deleteWhere { pair(projectId, userId) } == 0) return@transaction ShareResult.NotFound
        ShareResult.Success(Unit)
    }

    fun isSharedWith(projectId: String, userId: String): Boolean = transaction {
        ProjectSharesTable.selectAll().where { pair(projectId, userId) }.any()
    }

    private fun pair(projectId: String, userId: String) =
        (ProjectSharesTable.projectId eq projectId) and (ProjectSharesTable.userId eq userId)

    private fun liveProject(projectId: String) = ProjectsTable.selectAll()
        .where { (ProjectsTable.id eq projectId) and ProjectsTable.deletedAt.isNull() }
        .firstOrNull()

    private fun ownerCheck(ownerId: String, projectId: String): ShareResult<Nothing>? {
        val project = liveProject(projectId) ?: return ShareResult.NotFound
        return if (project[ProjectsTable.userId] != ownerId) ShareResult.Forbidden else null
    }

    private fun shares(where: Op<Boolean>): List<ProjectShare> {
        val granter = UsersTable.alias("granter")
        return ProjectSharesTable
            .join(UsersTable, JoinType.INNER, ProjectSharesTable.userId, UsersTable.id)
            .join(granter, JoinType.LEFT, ProjectSharesTable.grantedBy, granter[UsersTable.id])
            .selectAll()
            .where { where }
            .orderBy(ProjectSharesTable.createdAt to SortOrder.DESC)
            .map {
                ProjectShare(
                    userId = it[ProjectSharesTable.userId],
                    displayName = it[UsersTable.displayName],
                    photoUrl = it[UsersTable.photoUrl],
                    grantedBy = it[ProjectSharesTable.grantedBy],
                    grantedByName = it[granter[UsersTable.displayName]],
                    createdAt = it[ProjectSharesTable.createdAt]
                )
            }
    }
}
