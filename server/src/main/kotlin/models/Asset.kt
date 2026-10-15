package com.rewild.models

import kotlinx.serialization.Serializable

@Serializable
data class Asset(
    val id: String,
    val projectId: String,
    // Null for a project file, such as the project image.
    val levelId: String? = null,
    val assetType: String,
    val filename: String,
    val contentType: String,
    // Carries ?v={updatedAt}, so a changed file gets a new URL.
    val publicUrl: String,
    // The version of the file. Set when an upload is confirmed.
    val updatedAt: Long
)

@Serializable
data class UploadUrlRequest(
    val projectId: String,
    // Null for a project file.
    val levelId: String? = null,
    val assetType: String,
    val filename: String,
    val contentType: String,
    val size: Long
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
