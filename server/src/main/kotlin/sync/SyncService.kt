package com.rewild.sync

import com.rewild.levels.LevelService
import com.rewild.models.Level
import com.rewild.models.Project
import com.rewild.models.SyncRecord
import com.rewild.models.SyncRequest
import com.rewild.models.SyncResponse
import com.rewild.projects.ProjectService
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

private val json = Json { ignoreUnknownKeys = true }

class SyncService(
    private val projectService: ProjectService,
    private val levelService: LevelService
) {
    fun sync(userId: String, request: SyncRequest): SyncResponse {
        val now = System.currentTimeMillis()

        // Push phase: upsert each incoming record if it is newer than the server version.
        // userId is always derived from the JWT — the value in the record body is ignored.
        for (record in request.records) {
            when (record.collection) {
                "projects" -> {
                    val incoming = json.decodeFromJsonElement<Project>(record.data)
                    val existing = projectService.getById(userId, record.id)
                    if (existing == null || record.updatedAt > existing.updatedAt) {
                        projectService.upsert(userId, incoming.copy(userId = userId, syncedAt = now, syncError = null))
                    }
                }
                "levels" -> {
                    val incoming = json.decodeFromJsonElement<Level>(record.data)
                    val existing = levelService.getById(userId, record.id)
                    if (existing == null || record.updatedAt > existing.updatedAt) {
                        levelService.upsert(userId, incoming.copy(userId = userId, syncedAt = now, syncError = null))
                    }
                }
                // Unknown collections are silently skipped.
            }
        }

        // Pull phase: return everything the client hasn't seen yet.
        // lastSyncedAt = 0 means first sync — return the full dataset.
        val projects = projectService.getAllNewerThan(userId, request.lastSyncedAt)
        val levels = levelService.getAllNewerThan(userId, request.lastSyncedAt)

        val responseRecords = buildList {
            projects.forEach { add(SyncRecord("projects", it.id, it.updatedAt, json.encodeToJsonElement(it).jsonObject)) }
            levels.forEach { add(SyncRecord("levels", it.id, it.updatedAt, json.encodeToJsonElement(it).jsonObject)) }
        }

        return SyncResponse(syncedAt = now, records = responseRecords)
    }
}
