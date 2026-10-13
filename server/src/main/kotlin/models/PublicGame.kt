package com.rewild.models

import kotlinx.serialization.Serializable

@Serializable
data class PublicGame(
    val id: String,
    val name: String,
    val description: String,
    val imageUrl: String? = null
)

@Serializable
data class SetPublicGameRequest(
    // Null clears the promotion.
    val projectId: String? = null
)
