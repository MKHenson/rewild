package com.rewild.play

import com.rewild.assets.AssetService
import com.rewild.levels.LevelService
import com.rewild.models.PlayProject
import com.rewild.projects.ProjectService
import com.rewild.publicgame.PublicGameService

class PlayService(
    private val projects: ProjectService,
    private val levels: LevelService,
    private val assets: AssetService,
    private val publicGame: PublicGameService
) {
    /** The project with its levels and files, or null when it does not exist or [userId] may not play it. */
    fun load(userId: String?, projectId: String): PlayProject? {
        val project = projects.getLive(projectId) ?: return null
        val allowed = project.userId == userId || publicGame.isPublic(projectId)
        if (!allowed) return null

        val projectLevels = levels.getLiveByProject(projectId)
        return PlayProject(
            project = project,
            levels = projectLevels,
            assets = assets.listConfirmedForLevels(projectLevels.map { it.id })
        )
    }
}
