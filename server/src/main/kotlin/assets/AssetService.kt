package com.rewild.assets

import com.rewild.db.tables.AssetsTable
import com.rewild.db.tables.LevelsTable
import com.rewild.models.Asset
import com.rewild.models.UploadUrlResponse
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNull
import org.jetbrains.exposed.sql.SqlExpressionBuilder.less
import org.jetbrains.exposed.sql.transactions.transaction
import java.util.UUID

private const val ONE_HOUR_MS = 3_600_000L

class AssetService(
    private val s3: S3Signer?,
    private val bucketName: String,
    private val bucketBaseUrl: String
) {
    fun listConfirmed(userId: String): List<Asset> = transaction {
        AssetsTable.join(LevelsTable, JoinType.INNER, AssetsTable.levelId, LevelsTable.id)
            .selectAll()
            .where { (AssetsTable.userId eq userId) and (AssetsTable.confirmed eq true) }
            .map { it.toAsset() }
    }

    /** The confirmed files of the given levels, whoever owns them. */
    fun listConfirmedForLevels(levelIds: List<String>): List<Asset> = transaction {
        if (levelIds.isEmpty()) return@transaction emptyList()
        AssetsTable.join(LevelsTable, JoinType.INNER, AssetsTable.levelId, LevelsTable.id)
            .selectAll()
            .where { (AssetsTable.levelId inList levelIds) and (AssetsTable.confirmed eq true) }
            .map { it.toAsset() }
    }

    // Returns null if the levelId doesn't belong to the user.
    fun requestUploadUrl(userId: String, levelId: String, assetType: String, filename: String): UploadUrlResponse? = transaction {
        // A deleted level takes no new files: they would outlive its cleanup.
        val projectId = LevelsTable.selectAll()
            .where {
                (LevelsTable.id eq levelId) and (LevelsTable.userId eq userId) and LevelsTable.deletedAt.isNull()
            }
            .firstOrNull()
            ?.get(LevelsTable.projectId)
            ?: return@transaction null

        val storageKey = "${StorageKeys.level(userId, projectId, levelId)}$assetType/$filename"
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()

        // Upsert: if a record for this key already exists (e.g. re-upload), reuse it.
        val existing = AssetsTable.selectAll()
            .where { AssetsTable.storageKey eq storageKey }
            .firstOrNull()

        if (existing == null) {
            AssetsTable.insert {
                it[AssetsTable.id] = id
                it[AssetsTable.userId] = userId
                it[AssetsTable.levelId] = levelId
                it[AssetsTable.assetType] = assetType
                it[AssetsTable.filename] = filename
                it[AssetsTable.storageKey] = storageKey
                it[confirmed] = false
                it[createdAt] = now
            }
        } else {
            AssetsTable.update({ AssetsTable.storageKey eq storageKey }) {
                it[confirmed] = false
                it[createdAt] = now
            }
        }

        val uploadUrl = s3?.presignPut(bucketName, storageKey) ?: return@transaction null
        val publicUrl = "$bucketBaseUrl/$storageKey"

        UploadUrlResponse(uploadUrl = uploadUrl, publicUrl = publicUrl, storageKey = storageKey)
    }

    // Returns false if the record isn't found or doesn't belong to the user.
    fun confirmUpload(userId: String, storageKey: String): Boolean = transaction {
        val updated = AssetsTable.update({
            (AssetsTable.storageKey eq storageKey) and (AssetsTable.userId eq userId)
        }) {
            it[confirmed] = true
            it[updatedAt] = System.currentTimeMillis()
        }

        if (updated > 0) {
            purgeStaleUnconfirmed()
        }

        updated > 0
    }

    private fun purgeStaleUnconfirmed() {
        val cutoff = System.currentTimeMillis() - ONE_HOUR_MS
        AssetsTable.deleteWhere {
            (confirmed eq false) and (createdAt less cutoff)
        }
    }

    private fun ResultRow.toAsset() = Asset(
        id = this[AssetsTable.id],
        projectId = this[LevelsTable.projectId],
        levelId = this[AssetsTable.levelId],
        assetType = this[AssetsTable.assetType],
        filename = this[AssetsTable.filename],
        publicUrl = "$bucketBaseUrl/${this[AssetsTable.storageKey]}?v=${this[AssetsTable.updatedAt]}",
        updatedAt = this[AssetsTable.updatedAt]
    )
}
