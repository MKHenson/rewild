package com.rewild.models

import kotlinx.serialization.Serializable

@Serializable
data class Project(
    val id: String,
    val userId: String? = null,
    val levelId: String? = null,
    val name: String,
    val description: String,
    val activeOnStartup: Boolean,
    val startEvent: String,
    val sceneGraph: SceneGraph,
    val updatedAt: Long,
    val syncedAt: Long = 0,
    val deletedAt: Long? = null,
    val syncError: String? = null
)
