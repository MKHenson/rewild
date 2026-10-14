package com.rewild.models

import kotlinx.serialization.Serializable

/** Another user, as any logged in user may see them. Never carries an email. */
@Serializable
data class UserSummary(
    val id: String,
    val displayName: String,
    val photoUrl: String? = null
)
