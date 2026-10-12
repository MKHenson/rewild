package com.rewild.sync

import com.rewild.assets.AssetCleanupService
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

private fun isNewer(incoming: Long?, existing: Long?) =
    incoming != null && (existing == null || incoming > existing)

class SyncService(
    private val projectService: ProjectService,
    private val levelService: LevelService,
    private val cleanup: AssetCleanupService? = null
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
        // Deletes only go through DELETE /api/projects/{id}: a client tombstone is ignored, and so
        // is a push to a record the server has already deleted.
        //
        // Pass 1: insert/update projects with levelId = null so that levels can satisfy
        //         their project_id FK in pass 2.
        val projectsNeedingLevelId = mutableListOf<Pair<SyncRecord, Project>>()
        for ((record, incoming) in projectRecords) {
            if (incoming.deletedAt != null) continue
            val existing = projectService.getById(userId, record.id)
            if (existing?.deletedAt != null) continue
            if (existing == null || record.updatedAt > existing.updatedAt) {
                projectService.upsert(userId, incoming.copy(userId = userId, levelId = null, syncedAt = now, syncError = null))
                if (incoming.levelId != null) projectsNeedingLevelId.add(record to incoming)
            }
        }

        // Pass 2: upsert levels — projects exist now so project_id FK is satisfied.
        // A level whose chunk clear is newer than the server's: the client removed
        // its chunk files, so the server removes its copies too. Checked on every
        // record, so an older update that carries a newer clear still clears.
        val chunksCleared = mutableListOf<String>()
        for ((record, incoming) in levelRecords) {
            if (incoming.deletedAt != null) continue
            val existing = levelService.getById(userId, record.id)
            if (existing?.deletedAt != null) continue
            val clearsChunks = isNewer(incoming.chunksClearedAt, existing?.chunksClearedAt)
            if (existing == null || record.updatedAt > existing.updatedAt) {
                // Null when another user owns the id: nothing of theirs is touched.
                levelService.upsert(userId, incoming.copy(userId = userId, syncedAt = now, syncError = null))
                    ?: continue
            } else if (clearsChunks) {
                levelService.upsert(
                    userId,
                    existing.copy(
                        chunksClearedAt = incoming.chunksClearedAt,
                        updatedAt = maxOf(existing.updatedAt, now),
                        syncedAt = now
                    )
                )
            }
            if (clearsChunks) chunksCleared.add(record.id)
        }

        // Pass 3: patch levelId back onto the projects that needed it — levels exist now.
        for ((_, incoming) in projectsNeedingLevelId) {
            projectService.upsert(userId, incoming.copy(userId = userId, syncedAt = now, syncError = null))
        }

        // Never throws, so a bucket outage can't fail the sync — failures are queued for a later retry.
        for (levelId in chunksCleared) cleanup?.clearChunks(levelId)

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
