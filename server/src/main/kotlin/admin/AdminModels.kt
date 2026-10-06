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
