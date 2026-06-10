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

        // Split incoming records by collection for ordered processing.
        val projectRecords = mutableListOf<Pair<SyncRecord, Project>>()
        val levelRecords = mutableListOf<Pair<SyncRecord, Level>>()
        for (record in request.records) {
            when (record.collection) {
                "projects" -> projectRecords.add(record to json.decodeFromJsonElement(record.data))
                "levels" -> levelRecords.add(record to json.decodeFromJsonElement(record.data))
                // Unknown collections are silently skipped.
            }
        }

        // Push phase — three passes to resolve the circular FK between projects and levels:
        //   levels.project_id  → projects(id)  NOT NULL
        //   projects.level_id  → levels(id)    nullable
        //
        // Pass 1: insert/update projects with levelId = null so that levels can satisfy
        //         their project_id FK in pass 2.
        val projectsNeedingLevelId = mutableListOf<Pair<SyncRecord, Project>>()
        for ((record, incoming) in projectRecords) {
            val existing = projectService.getById(userId, record.id)
            if (existing == null || record.updatedAt > existing.updatedAt) {
                projectService.upsert(userId, incoming.copy(userId = userId, levelId = null, syncedAt = now, syncError = null))
                if (incoming.levelId != null) projectsNeedingLevelId.add(record to incoming)
            }
        }

        // Pass 2: upsert levels — projects exist now so project_id FK is satisfied.
        for ((record, incoming) in levelRecords) {
            val existing = levelService.getById(userId, record.id)
            if (existing == null || record.updatedAt > existing.updatedAt) {
                levelService.upsert(userId, incoming.copy(userId = userId, syncedAt = now, syncError = null))
            }
        }

        // Pass 3: patch levelId back onto the projects that needed it — levels exist now.
        // Skip tombstones: their levelId is irrelevant and the level may no longer exist.
        for ((_, incoming) in projectsNeedingLevelId) {
            if (incoming.deletedAt != null) continue
            projectService.upsert(userId, incoming.copy(userId = userId, syncedAt = now, syncError = null))
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
