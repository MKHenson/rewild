package com.rewild.admin

import kotlinx.serialization.Serializable

@Serializable
data class UserAccount(
    val id: String,
    val email: String,
    val displayName: String,
    val role: String,
    val photoUrl: String?,
    val hasPassword: Boolean,
    val hasGoogle: Boolean,
    val projectCount: Long,
    val createdAt: Long,
)

@Serializable
data class UpdateUserRequest(val displayName: String, val role: String)

@Serializable
data class AdminProject(
    val id: String,
    val name: String,
    val description: String,
    val imageUrl: String?,
    val authorId: String,
    val authorName: String,
    val updatedAt: Long,
    val flaggedAt: Long?,
)

@Serializable
data class AdminProjectPage(
    val items: List<AdminProject>,
    // Live projects across all pages.
    val total: Long,
)

enum class AdminProjectSort { NAME, AUTHOR, UPDATED, FLAGGED }
