package com.rewild.models

import kotlinx.serialization.Serializable

@Serializable
data class Asset(
    val id: String,
    val projectId: String,
    val levelId: String,
    val assetType: String,
    val filename: String,
    // Carries ?v={updatedAt}, so a changed file gets a new URL.
    val publicUrl: String,
    val updatedAt: Long
)

@Serializable
data class UploadUrlRequest(
    val levelId: String,
    val assetType: String,
    val filename: String
)

@Serializable
data class UploadUrlResponse(
    val uploadUrl: String,
    val publicUrl: String,
    val storageKey: String
)

@Serializable
data class ConfirmRequest(
    val storageKey: String
)
