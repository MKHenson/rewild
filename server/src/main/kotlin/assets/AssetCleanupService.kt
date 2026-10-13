package com.rewild.assets

import com.rewild.db.tables.AssetCleanupQueueTable
import com.rewild.db.tables.AssetsTable
import org.jetbrains.exposed.sql.SqlExpressionBuilder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.slf4j.LoggerFactory
import java.util.UUID

// Removing a level or project must never be blocked by object storage, but the bucket has no
// other record of what belongs to whom — once the id is gone from the DB,
// nothing would ever revisit the prefix. So a failed delete is parked in
// asset_cleanup_queue for a reaper to retry via retryPending().
class AssetCleanupService(
    private val s3: S3Deleter?,
    private val bucketName: String
) {
    private val log = LoggerFactory.getLogger(AssetCleanupService::class.java)

    companion object {
        private const val CHUNK = "chunk"
    }

    // Call after the level's deletion has been committed. Never throws.
    fun cleanupLevel(userId: String, projectId: String, levelId: String) {
        deleteAssetRows(listOf(levelId))
        deletePrefix(StorageKeys.level(userId, projectId, levelId))
    }

    // Removes every file of a project: its levels' files and its image. Call after the
    // project's deletion has been committed. Never throws.
    fun cleanupProject(userId: String, projectId: String, levelIds: List<String>) {
        deleteAssetRows(levelIds)
        deletePrefix(StorageKeys.project(userId, projectId))
    }

    // Removes every chunk file of a level that stays. Call after the clear has been
    // committed. Never throws.
    fun clearChunks(userId: String, projectId: String, levelId: String) {
        val target = levelId
        transaction {
            AssetsTable.deleteWhere { (AssetsTable.levelId eq target) and (AssetsTable.assetType eq CHUNK) }
        }
        deletePrefix("${StorageKeys.level(userId, projectId, levelId)}$CHUNK/")
    }

    // Removes one object. The key is used as a prefix, so it must not prefix any other key.
    // Never throws.
    fun deleteObject(key: String) = deletePrefix(key)

    // Hard deletes cascade asset rows away already; tombstoned levels keep theirs, and a
    // stale row would otherwise have the client re-pull a dead asset.
    private fun deleteAssetRows(levelIds: List<String>) {
        if (levelIds.isEmpty()) return
        transaction { AssetsTable.deleteWhere { AssetsTable.levelId inList levelIds } }
    }

    private fun deletePrefix(prefix: String) {
        // No bucket configured (local OPFS-only dev): nothing to delete, and queueing
        // would only accumulate rows no reaper could ever drain.
        if (s3 == null) return

        try {
            val deleted = s3.deletePrefix(bucketName, prefix)
            log.info("Deleted {} object(s) under {}", deleted, prefix)
        } catch (e: Exception) {
            log.error("Failed to delete objects under {}: {} — queued for retry", prefix, e.message)
            enqueue(prefix, e.message)
        }
    }

    // Retries queued prefixes, clearing the ones that now succeed. Returns the number drained.
    fun retryPending(limit: Int = 50): Int {
        if (s3 == null) return 0

        val pending = transaction {
            AssetCleanupQueueTable.selectAll()
                .orderBy(AssetCleanupQueueTable.createdAt)
                .limit(limit)
                .map { it[AssetCleanupQueueTable.id] to it[AssetCleanupQueueTable.prefix] }
        }

        var drained = 0
        for ((queuedId, prefix) in pending) {
            try {
                val deleted = s3.deletePrefix(bucketName, prefix)
                transaction { AssetCleanupQueueTable.deleteWhere { AssetCleanupQueueTable.id eq queuedId } }
                drained++
                log.info("Drained queued cleanup for {} ({} object(s))", prefix, deleted)
            } catch (e: Exception) {
                log.error("Retry failed for {}: {}", prefix, e.message)
                transaction {
                    AssetCleanupQueueTable.update({ AssetCleanupQueueTable.id eq queuedId }) {
                        with(SqlExpressionBuilder) { it.update(attempts, attempts + 1) }
                        it[lastError] = e.message
                        it[lastAttemptAt] = System.currentTimeMillis()
                    }
                }
            }
        }
        return drained
    }

    private fun enqueue(prefix: String, error: String?) = transaction {
        val now = System.currentTimeMillis()
        val existing = AssetCleanupQueueTable.selectAll()
            .where { AssetCleanupQueueTable.prefix eq prefix }
            .firstOrNull()

        // The same prefix can fail repeatedly (a re-created id can't happen, but a
        // tombstone can arrive on several syncs before the bucket recovers).
        if (existing == null) {
            AssetCleanupQueueTable.insert {
                it[AssetCleanupQueueTable.id] = UUID.randomUUID().toString()
                it[AssetCleanupQueueTable.prefix] = prefix
                it[attempts] = 1
                it[lastError] = error
                it[createdAt] = now
                it[lastAttemptAt] = now
            }
        } else {
            AssetCleanupQueueTable.update({ AssetCleanupQueueTable.prefix eq prefix }) {
                with(SqlExpressionBuilder) { it.update(attempts, attempts + 1) }
                it[lastError] = error
                it[lastAttemptAt] = now
            }
        }
    }
}
