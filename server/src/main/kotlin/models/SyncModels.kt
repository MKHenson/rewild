package com.rewild.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class SyncRecord(
    val collection: String,
    val id: String,
    val updatedAt: Long,
    val data: JsonObject
)

@Serializable
data class SyncRequest(
    val lastSyncedAt: Long,
    val records: List<SyncRecord>
)

@Serializable
data class SyncResponse(
    val syncedAt: Long,
    val records: List<SyncRecord>
)
