package com.rewild.assets

import com.rewild.db.tables.AssetCleanupQueueTable
import com.rewild.db.tables.AssetsTable
import org.jetbrains.exposed.sql.SqlExpressionBuilder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.slf4j.LoggerFactory
import java.util.UUID

// Removing a level must never be blocked by object storage, but the bucket has no
// other record of what belongs to whom — once the level id is gone from the DB,
// nothing would ever revisit the prefix. So a failed delete is parked in
// asset_cleanup_queue for a reaper to retry via retryPending().
class AssetCleanupService(
    private val s3: S3Deleter?,
    private val bucketName: String
) {
    private val log = LoggerFactory.getLogger(AssetCleanupService::class.java)

    fun prefixFor(levelId: String) = "levels/$levelId/"

    // Call after the level's deletion has been committed. Never throws.
    fun cleanupLevel(levelId: String) {
        // Bound outside the deleteWhere lambda: inside it, an unqualified `levelId`
        // resolves to the column, not this parameter, which would match every row.
        val target = levelId
        // Hard deletes cascade these away already; tombstoned levels keep their rows,
        // and a stale row would otherwise have the client re-pull a dead asset.
        transaction { AssetsTable.deleteWhere { AssetsTable.levelId eq target } }

        val prefix = prefixFor(levelId)
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
