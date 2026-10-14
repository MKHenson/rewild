package com.rewild.models

import kotlinx.serialization.Serializable

@Serializable
data class Project(
    val id: String,
    val userId: String? = null,
    val levelId: String? = null,
    val name: String,
    val description: String,
    val startEvent: String,
    val sceneGraph: SceneGraph,
    val updatedAt: Long,
    val syncedAt: Long = 0,
    val deletedAt: Long? = null,
    val syncError: String? = null,
    // Set by the server from the uploaded image. Ignored on writes.
    val imageUrl: String? = null,
    // Set when a super admin blocks the project. Ignored on writes.
    val flaggedAt: Long? = null
)

@Serializable
data class ProjectImageUploadRequest(
    val contentType: String,
    val size: Long
)

@Serializable
data class ProjectImageResponse(
    val imageUrl: String
)
