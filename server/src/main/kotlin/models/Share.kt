package com.rewild.models

import kotlinx.serialization.Serializable

@Serializable
data class ProjectShare(
    val userId: String,
    val displayName: String,
    val photoUrl: String? = null,
    val grantedBy: String,
    val grantedByName: String? = null,
    val createdAt: Long
)

@Serializable
data class AddShareRequest(val userId: String)
