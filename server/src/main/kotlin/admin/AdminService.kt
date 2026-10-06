package com.rewild.admin

import com.rewild.auth.AuthService
import com.rewild.auth.UserRole
import com.rewild.db.tables.ProjectsTable
import com.rewild.db.tables.UsersTable
import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.count
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

sealed interface UpdateUserResult {
    data class Success(val user: UserAccount) : UpdateUserResult
    data object NotFound : UpdateUserResult
    data class Invalid(val reason: String) : UpdateUserResult
}

class AdminService(private val authService: AuthService) {

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
