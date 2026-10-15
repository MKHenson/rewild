package com.rewild.play

import com.rewild.assets.AssetService
import com.rewild.levels.LevelService
import com.rewild.models.PlayProject
import com.rewild.projects.ProjectService
import com.rewild.publicgame.PublicGameService
import com.rewild.shares.ShareService

sealed interface PlayResult {
    data class Success(val data: PlayProject) : PlayResult
    data object NotFound : PlayResult
    data object Flagged : PlayResult
}

class PlayService(
    private val projects: ProjectService,
    private val levels: LevelService,
    private val assets: AssetService,
    private val publicGame: PublicGameService,
    private val shares: ShareService,
    private val isSuperAdmin: (String) -> Boolean
) {
    /**
     * The project with its levels and files. NotFound when it does not exist or [userId] may not play it,
     * so the caller cannot tell the two apart. Flagged when it is blocked and [userId] is not its owner or a super admin.
     */
    fun load(userId: String?, projectId: String): PlayResult {
        val project = projects.getLive(projectId) ?: return PlayResult.NotFound
        val owner = userId != null && project.userId == userId
        val admin = userId != null && isSuperAdmin(userId)
        val allowed = owner || admin || publicGame.isPublic(projectId) ||
            (userId != null && shares.isSharedWith(projectId, userId))
        if (!allowed) return PlayResult.NotFound
        if (project.flaggedAt != null && !owner && !admin) return PlayResult.Flagged

        val projectLevels = levels.getLiveByProject(projectId)
        return PlayResult.Success(
            PlayProject(
                project = project,
                levels = projectLevels,
                assets = assets.listConfirmedForProject(projectId)
            )
        )
    }
}
