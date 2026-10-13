package com.rewild.models

import kotlinx.serialization.Serializable

@Serializable
data class PlayProject(
    val project: Project,
    val levels: List<Level>,
    // The confirmed files of every level. Each names its level.
    val assets: List<Asset>
)
