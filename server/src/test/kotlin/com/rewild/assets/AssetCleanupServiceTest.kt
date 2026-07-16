package com.rewild.assets

import com.rewild.db.tables.AssetCleanupQueueTable
import com.rewild.db.tables.AssetsTable
import com.rewild.levels.LevelService
import com.rewild.models.*
import com.rewild.projects.ProjectService
import com.rewild.startTestDatabase
import com.rewild.sync.SyncService
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.insertIgnore
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.AfterClass
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

// Stands in for the bucket: models objects as keys so prefix scoping is observable.
private class FakeBucket : S3Deleter {
    val objects = mutableSetOf<String>()
    val prefixCalls = mutableListOf<String>()
    var failing = false

    override fun deletePrefix(bucket: String, prefix: String): Int {
        prefixCalls.add(prefix)
        if (failing) throw RuntimeException("bucket unreachable")
        val matched = objects.filter { it.startsWith(prefix) }
        objects.removeAll(matched.toSet())
        return matched.size
    }
}

class AssetCleanupServiceTest {

    companion object {
        private lateinit var postgres: EmbeddedPostgres
        private lateinit var projectService: ProjectService
        private val json = Json { ignoreUnknownKeys = true }

        const val USER_A = "cleanup-user-a"
        const val PROJECT_A = "cleanup-proj-a"

        @BeforeClass
        @JvmStatic
        fun setup() {
            postgres = startTestDatabase()
            projectService = ProjectService()
            projectService.upsert(USER_A, makeProject(PROJECT_A))
        }

        @AfterClass
        @JvmStatic
        fun teardown() {
            postgres.close()
        }

        private fun makeProject(id: String) = Project(
            id = id,
            userId = "placeholder",
            levelId = null,
            name = "Fixture Project",
            description = "",
            activeOnStartup = false,
            startEvent = "",
            sceneGraph = SceneGraph(
                containers = emptyList(),
                atmosphere = Atmosphere(
                    elevation = JsonPrimitive(0.0),
                    cloudiness = JsonPrimitive(0.0),
                    foginess = JsonPrimitive(0.0),
                    windiness = JsonPrimitive(0.0),
                    precipitation = JsonPrimitive(0.0),
                    temperature = JsonPrimitive(20.0),
                    dayNightCycle = JsonPrimitive(true)
                )
            ),
            updatedAt = 1000L
        )

        private fun makeLevel(
            id: String,
            updatedAt: Long = 1000L,
            deletedAt: Long? = null
        ) = Level(
            id = id,
            userId = "placeholder",
            projectId = PROJECT_A,
            name = "Fixture Level",
            activeOnStartup = false,
            hasTerrain = false,
            startEvent = "",
            containers = emptyList(),
            updatedAt = updatedAt,
            deletedAt = deletedAt
        )

        private fun insertAsset(id: String, levelId: String, filename: String) = transaction {
            AssetsTable.insertIgnore {
                it[AssetsTable.id] = id
                it[AssetsTable.userId] = USER_A
                it[AssetsTable.levelId] = levelId
                it[AssetsTable.assetType] = "chunk"
                it[AssetsTable.filename] = filename
                it[AssetsTable.storageKey] = "levels/$levelId/chunk/$filename"
                it[AssetsTable.confirmed] = true
                it[AssetsTable.createdAt] = System.currentTimeMillis()
            }
        }

        private fun queuedPrefixes() = transaction {
            AssetCleanupQueueTable.selectAll().map { it[AssetCleanupQueueTable.prefix] }
        }

        private fun assetIdsFor(levelId: String) = transaction {
            AssetsTable.selectAll()
                .where { AssetsTable.levelId eq levelId }
                .map { it[AssetsTable.id] }
        }
    }

    private lateinit var bucket: FakeBucket
    private lateinit var cleanup: AssetCleanupService
    private lateinit var levelService: LevelService

    @Before
    fun beforeEach() {
        transaction { AssetCleanupQueueTable.deleteAll() }
        bucket = FakeBucket()
        cleanup = AssetCleanupService(s3 = bucket, bucketName = "test-bucket")
        levelService = LevelService(cleanup)
    }

    // --- Hard delete (DELETE /api/levels/{id}) ---

    @Test
    fun `deleting a level removes its objects and leaves other levels untouched`() {
        levelService.upsert(USER_A, makeLevel("cl-delete-me"))
        levelService.upsert(USER_A, makeLevel("cl-keep-me"))
        bucket.objects += setOf(
            "levels/cl-delete-me/chunk/0_0.bin",
            "levels/cl-delete-me/chunk/0_1.bin",
            "levels/cl-keep-me/chunk/0_0.bin"
        )

        levelService.delete(USER_A, "cl-delete-me")

        assertEquals(setOf("levels/cl-keep-me/chunk/0_0.bin"), bucket.objects)
        assertEquals(listOf("levels/cl-delete-me/"), bucket.prefixCalls)
    }

    @Test
    fun `a level id that prefixes another is not over-matched`() {
        // "cl-lvl-1" must not sweep away "cl-lvl-10" — the trailing slash is what
        // keeps the prefix from spilling into sibling ids.
        levelService.upsert(USER_A, makeLevel("cl-lvl-1"))
        levelService.upsert(USER_A, makeLevel("cl-lvl-10"))
        bucket.objects += setOf("levels/cl-lvl-1/chunk/a.bin", "levels/cl-lvl-10/chunk/a.bin")

        levelService.delete(USER_A, "cl-lvl-1")

        assertEquals(setOf("levels/cl-lvl-10/chunk/a.bin"), bucket.objects)
    }

    @Test
    fun `a failed delete for another user's level never touches the bucket`() {
        levelService.upsert(USER_A, makeLevel("cl-not-yours"))
        bucket.objects += "levels/cl-not-yours/chunk/a.bin"

        levelService.delete("cleanup-user-b", "cl-not-yours")

        assertTrue(bucket.prefixCalls.isEmpty())
        assertEquals(setOf("levels/cl-not-yours/chunk/a.bin"), bucket.objects)
    }

    @Test
    fun `deletion still succeeds when the bucket is unreachable, and the prefix is queued`() {
        levelService.upsert(USER_A, makeLevel("cl-bucket-down"))
        bucket.failing = true

        val result = levelService.delete(USER_A, "cl-bucket-down")

        assertEquals(com.rewild.common.DeleteResult.Success, result)
        assertNull(levelService.getById(USER_A, "cl-bucket-down"))
        assertEquals(listOf("levels/cl-bucket-down/"), queuedPrefixes())
    }

    @Test
    fun `no queue row is written when the bucket delete succeeds`() {
        levelService.upsert(USER_A, makeLevel("cl-clean-delete"))

        levelService.delete(USER_A, "cl-clean-delete")

        assertTrue(queuedPrefixes().isEmpty())
    }

    // --- Tombstone sync (the path the editor actually uses) ---

    @Test
    fun `syncing a level tombstone cleans up its objects and asset rows`() {
        val syncService = SyncService(projectService, levelService, cleanup)
        levelService.upsert(USER_A, makeLevel("cl-tombstone"))
        insertAsset("cl-tombstone-asset", "cl-tombstone", "0_0.bin")
        bucket.objects += "levels/cl-tombstone/chunk/0_0.bin"

        val tombstone = makeLevel("cl-tombstone", updatedAt = 2000L, deletedAt = 2000L)
        syncService.sync(USER_A, syncRequestFor(tombstone))

        assertTrue(bucket.objects.isEmpty())
        assertTrue(assetIdsFor("cl-tombstone").isEmpty())
    }

    @Test
    fun `re-syncing the same tombstone does not hit the bucket again`() {
        val syncService = SyncService(projectService, levelService, cleanup)
        levelService.upsert(USER_A, makeLevel("cl-resync"))

        val tombstone = makeLevel("cl-resync", updatedAt = 2000L, deletedAt = 2000L)
        syncService.sync(USER_A, syncRequestFor(tombstone))
        // A later push of the same tombstone — updatedAt moves, deletedAt was already set.
        val later = makeLevel("cl-resync", updatedAt = 3000L, deletedAt = 2000L)
        syncService.sync(USER_A, syncRequestFor(later))

        assertEquals(listOf("levels/cl-resync/"), bucket.prefixCalls)
    }

    @Test
    fun `syncing a live level never triggers cleanup`() {
        val syncService = SyncService(projectService, levelService, cleanup)
        levelService.upsert(USER_A, makeLevel("cl-still-alive"))

        val updated = makeLevel("cl-still-alive", updatedAt = 2000L)
        syncService.sync(USER_A, syncRequestFor(updated))

        assertTrue(bucket.prefixCalls.isEmpty())
    }

    @Test
    fun `a sync tombstone still succeeds when the bucket is unreachable`() {
        val syncService = SyncService(projectService, levelService, cleanup)
        levelService.upsert(USER_A, makeLevel("cl-sync-bucket-down"))
        bucket.failing = true

        val tombstone = makeLevel("cl-sync-bucket-down", updatedAt = 2000L, deletedAt = 2000L)
        val response = syncService.sync(USER_A, syncRequestFor(tombstone))

        assertTrue(response.syncedAt > 0)
        assertEquals(listOf("levels/cl-sync-bucket-down/"), queuedPrefixes())
    }

    // --- Queue drain ---

    @Test
    fun `retryPending drains a prefix once the bucket recovers`() {
        levelService.upsert(USER_A, makeLevel("cl-retry"))
        bucket.objects += "levels/cl-retry/chunk/a.bin"
        bucket.failing = true
        levelService.delete(USER_A, "cl-retry")
        assertEquals(listOf("levels/cl-retry/"), queuedPrefixes())

        bucket.failing = false
        val drained = cleanup.retryPending()

        assertEquals(1, drained)
        assertTrue(queuedPrefixes().isEmpty())
        assertTrue(bucket.objects.isEmpty())
    }

    @Test
    fun `retryPending keeps the row and counts the attempt when the bucket is still down`() {
        levelService.upsert(USER_A, makeLevel("cl-retry-fail"))
        bucket.failing = true
        levelService.delete(USER_A, "cl-retry-fail")

        val drained = cleanup.retryPending()

        assertEquals(0, drained)
        assertEquals(listOf("levels/cl-retry-fail/"), queuedPrefixes())
        val attempts = transaction {
            AssetCleanupQueueTable.selectAll()
                .where { AssetCleanupQueueTable.prefix eq "levels/cl-retry-fail/" }
                .single()[AssetCleanupQueueTable.attempts]
        }
        // One from the failed delete, one from the failed retry.
        assertEquals(2, attempts)
    }

    @Test
    fun `repeated failures for one prefix collapse onto a single queue row`() {
        levelService.upsert(USER_A, makeLevel("cl-dupe-a"))
        levelService.upsert(USER_A, makeLevel("cl-dupe-b"))
        bucket.failing = true

        levelService.delete(USER_A, "cl-dupe-a")
        cleanup.retryPending()
        cleanup.retryPending()
        levelService.delete(USER_A, "cl-dupe-b")

        assertEquals(2, queuedPrefixes().size)
    }

    // --- No bucket configured (local OPFS-only dev) ---

    @Test
    fun `with no S3 configured the delete succeeds and nothing is queued`() {
        val noS3 = AssetCleanupService(s3 = null, bucketName = "test-bucket")
        val service = LevelService(noS3)
        service.upsert(USER_A, makeLevel("cl-no-s3"))
        insertAsset("cl-no-s3-asset", "cl-no-s3", "0_0.bin")

        val result = service.delete(USER_A, "cl-no-s3")

        assertEquals(com.rewild.common.DeleteResult.Success, result)
        assertTrue(queuedPrefixes().isEmpty())
        assertEquals(0, noS3.retryPending())
    }

    @Test
    fun `cleanupLevel removes the level's asset rows but not another level's`() {
        levelService.upsert(USER_A, makeLevel("cl-rows-target"))
        levelService.upsert(USER_A, makeLevel("cl-rows-other"))
        insertAsset("cl-rows-1", "cl-rows-target", "a.bin")
        insertAsset("cl-rows-2", "cl-rows-other", "b.bin")

        cleanup.cleanupLevel("cl-rows-target")

        assertTrue(assetIdsFor("cl-rows-target").isEmpty())
        assertEquals(listOf("cl-rows-2"), assetIdsFor("cl-rows-other"))
    }

    private fun syncRequestFor(level: Level) = SyncRequest(
        lastSyncedAt = 0L,
        records = listOf(
            SyncRecord(
                collection = "levels",
                id = level.id,
                updatedAt = level.updatedAt,
                data = json.encodeToJsonElement(level).jsonObject
            )
        )
    )
}
