package com.rewild.admin

import com.rewild.auth.AuthService
import com.rewild.auth.UserRole
import com.rewild.db.tables.ProjectsTable
import com.rewild.db.tables.UsersTable
import com.rewild.db.tables.PublicGameTable
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.lowerCase
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNull
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.count
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

private const val DEFAULT_PAGE_SIZE = 25
private const val MAX_PAGE_SIZE = 100

enum class FlagResult { Success, NotFound, PublicGame }

sealed interface UpdateUserResult {
    data class Success(val user: UserAccount) : UpdateUserResult
    data object NotFound : UpdateUserResult
    data class Invalid(val reason: String) : UpdateUserResult
}

class AdminService(
    private val authService: AuthService,
    private val bucketBaseUrl: String = ""
) {

    fun isSuperAdmin(userId: String): Boolean = transaction {
        UsersTable.select(UsersTable.role)
            .where { UsersTable.id eq userId }
            .firstOrNull()
            ?.get(UsersTable.role) == UserRole.SUPER_ADMIN
    }

    fun listUsers(): List<UserAccount> = transaction {
        val projectCounts = projectCounts(null)
        UsersTable.selectAll()
            .orderBy(UsersTable.createdAt, SortOrder.DESC)
            .map { it.toUserAccount(projectCounts[it[UsersTable.id]] ?: 0) }
    }

    fun getUser(id: String): UserAccount? = transaction {
        val row = UsersTable.selectAll().where { UsersTable.id eq id }.firstOrNull()
            ?: return@transaction null
        row.toUserAccount(projectCounts(id)[id] ?: 0)
    }

    fun updateUser(actorId: String, id: String, req: UpdateUserRequest): UpdateUserResult {
        val displayName = req.displayName.trim()
        if (displayName.isEmpty()) return UpdateUserResult.Invalid("Display name is required")
        if (req.role !in UserRole.all) return UpdateUserResult.Invalid("Unknown role")

        val current = getUser(id) ?: return UpdateUserResult.NotFound
        if (actorId == id && req.role != current.role) {
            return UpdateUserResult.Invalid("You cannot change your own role")
        }

        transaction {
            UsersTable.update({ UsersTable.id eq id }) {
                it[UsersTable.displayName] = displayName
                it[role] = req.role
            }
        }

        return getUser(id)?.let { UpdateUserResult.Success(it) } ?: UpdateUserResult.NotFound
    }

    fun sendPasswordReset(id: String): Boolean {
        val user = getUser(id) ?: return false
        authService.forgotPassword(user.email)
        return true
    }

    /** One page of every live project, sorted by [sort]. Ties fall back to newest first. */
    fun listProjects(
        page: Int = 0,
        pageSize: Int = DEFAULT_PAGE_SIZE,
        sort: AdminProjectSort = AdminProjectSort.UPDATED,
        descending: Boolean = true,
    ): AdminProjectPage = transaction {
        val size = pageSize.coerceIn(1, MAX_PAGE_SIZE)
        // Nulls sort as smallest, so the two directions are exact reverses: flagged first descending, last ascending.
        val order = if (descending) SortOrder.DESC_NULLS_LAST else SortOrder.ASC_NULLS_FIRST
        val sortColumn: Expression<*> = when (sort) {
            AdminProjectSort.NAME -> ProjectsTable.name.lowerCase()
            AdminProjectSort.AUTHOR -> UsersTable.displayName.lowerCase()
            AdminProjectSort.UPDATED -> ProjectsTable.updatedAt
            AdminProjectSort.FLAGGED -> ProjectsTable.flaggedAt
        }

        val query = ProjectsTable
            .join(UsersTable, JoinType.INNER, ProjectsTable.userId, UsersTable.id)
            .selectAll()
            .where { ProjectsTable.deletedAt.isNull() }
        val total = query.count()

        val items = query
            .orderBy(sortColumn to order, ProjectsTable.updatedAt to SortOrder.DESC, ProjectsTable.id to SortOrder.ASC)
            .limit(size)
            .offset(page.coerceAtLeast(0).toLong() * size)
            .map {
                AdminProject(
                    id = it[ProjectsTable.id],
                    name = it[ProjectsTable.name],
                    description = it[ProjectsTable.description],
                    imageUrl = it[ProjectsTable.imageKey]?.let { key -> "$bucketBaseUrl/$key" },
                    authorId = it[ProjectsTable.userId],
                    authorName = it[UsersTable.displayName],
                    updatedAt = it[ProjectsTable.updatedAt],
                    flaggedAt = it[ProjectsTable.flaggedAt],
                )
            }
        AdminProjectPage(items, total)
    }

    /** Blocks a live project. The public game cannot be flagged. */
    fun flagProject(actorId: String, id: String): FlagResult = transaction {
        val live = (ProjectsTable.id eq id) and ProjectsTable.deletedAt.isNull()
        if (ProjectsTable.selectAll().where { live }.empty()) return@transaction FlagResult.NotFound
        if (PublicGameTable.selectAll().where { PublicGameTable.projectId eq id }.any()) return@transaction FlagResult.PublicGame

        ProjectsTable.update({ live and ProjectsTable.flaggedAt.isNull() }) {
            it[flaggedAt] = System.currentTimeMillis()
            it[flaggedBy] = actorId
        }
        FlagResult.Success
    }

    fun unflagProject(id: String): FlagResult = transaction {
        val live = (ProjectsTable.id eq id) and ProjectsTable.deletedAt.isNull()
        val updated = ProjectsTable.update({ live }) {
            it[flaggedAt] = null
            it[flaggedBy] = null
        }
        if (updated == 0) FlagResult.NotFound else FlagResult.Success
    }

    private fun projectCounts(userId: String?): Map<String, Long> {
        val count = ProjectsTable.id.count()
        return ProjectsTable.select(ProjectsTable.userId, count)
            .where {
                val live = ProjectsTable.deletedAt.isNull()
                if (userId == null) live else live and (ProjectsTable.userId eq userId)
            }
            .groupBy(ProjectsTable.userId)
            .associate { it[ProjectsTable.userId] to it[count] }
    }

    private fun ResultRow.toUserAccount(projectCount: Long) = UserAccount(
        id = this[UsersTable.id],
        email = this[UsersTable.email],
        displayName = this[UsersTable.displayName],
        role = this[UsersTable.role],
        photoUrl = this[UsersTable.photoUrl],
        hasPassword = this[UsersTable.passwordHash] != null,
        hasGoogle = this[UsersTable.googleId] != null,
        projectCount = projectCount,
        createdAt = this[UsersTable.createdAt],
    )
}
