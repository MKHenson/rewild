package com.rewild.publicgame

import com.rewild.db.tables.ProjectsTable
import com.rewild.db.tables.PublicGameTable
import com.rewild.models.PublicGame
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

sealed interface SetPublicGameResult {
    data class Success(val game: PublicGame?) : SetPublicGameResult
    data class Invalid(val message: String) : SetPublicGameResult
}

class PublicGameService(private val bucketBaseUrl: String = "") {

    /** The promoted project, or null when none is promoted or it was deleted. */
    fun get(): PublicGame? = transaction {
        PublicGameTable
            .join(ProjectsTable, JoinType.INNER, PublicGameTable.projectId, ProjectsTable.id)
            .selectAll()
            .where { ProjectsTable.deletedAt.isNull() }
            .firstOrNull()
            ?.let {
                PublicGame(
                    id = it[ProjectsTable.id],
                    name = it[ProjectsTable.name],
                    description = it[ProjectsTable.description],
                    imageUrl = it[ProjectsTable.imageKey]?.let { key -> "$bucketBaseUrl/$key" }
                )
            }
    }

    /** Promotes a live, unflagged project, or clears the promotion when [projectId] is null. */
    fun set(projectId: String?): SetPublicGameResult {
        if (projectId != null) {
            val project = transaction {
                ProjectsTable.selectAll()
                    .where { (ProjectsTable.id eq projectId) and ProjectsTable.deletedAt.isNull() }
                    .firstOrNull()
            } ?: return SetPublicGameResult.Invalid("The project is not saved on the server")
            if (project[ProjectsTable.flaggedAt] != null)
                return SetPublicGameResult.Invalid("The project is flagged. Unflag it before you promote it")
        }

        transaction {
            PublicGameTable.update { it[PublicGameTable.projectId] = projectId }
        }
        return SetPublicGameResult.Success(get())
    }

    fun isPublic(projectId: String): Boolean = transaction {
        PublicGameTable.selectAll().where { PublicGameTable.projectId eq projectId }.any()
    }
}
