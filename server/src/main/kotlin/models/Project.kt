package com.rewild.models

import kotlinx.serialization.Serializable

@Serializable
data class Project(
    val id: String,
    val userId: String? = null,
    val levelId: String? = null,
    val name: String,
    val description: String,
    val updatedAt: Long,
    val syncedAt: Long = 0,
    val deletedAt: Long? = null,
    val syncError: String? = null,
    // The URL of the project's image asset, set by the server. Ignored on writes.
    val imageUrl: String? = null,
    // Set when a super admin blocks the project. Ignored on writes.
    val flaggedAt: Long? = null,
    // The owner's display name, set by the server on project lists. Ignored on writes.
    val authorName: String? = null
)
