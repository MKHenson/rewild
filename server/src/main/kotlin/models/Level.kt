package com.rewild.models

import kotlinx.serialization.Serializable

@Serializable
data class Level(
    val id: String,
    val userId: String? = null,
    val projectId: String,
    val name: String,
    val activeOnStartup: Boolean,
    val hasTerrain: Boolean,
    val startEvent: String,
    val containers: List<Container>,
    val updatedAt: Long,
    val syncedAt: Long = 0,
    val syncError: String? = null
)
