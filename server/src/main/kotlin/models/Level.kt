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
    val deletedAt: Long? = null,
    val syncError: String? = null,
    // When the client last removed all of the level's chunk files. A newer value
    // has the server remove them too.
    val chunksClearedAt: Long? = null
)
