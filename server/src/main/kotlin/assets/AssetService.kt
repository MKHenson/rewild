package com.rewild.assets

import com.rewild.db.tables.AssetsTable
import com.rewild.db.tables.LevelsTable
import com.rewild.db.tables.ProjectsTable
import com.rewild.models.Asset
import com.rewild.models.UploadUrlRequest
import com.rewild.models.UploadUrlResponse
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNull
import org.jetbrains.exposed.sql.SqlExpressionBuilder.less
import org.jetbrains.exposed.sql.transactions.transaction
import java.util.UUID

private const val ONE_HOUR_MS = 3_600_000L

sealed interface AssetResult<out T> {
    data class Success<T>(val value: T) : AssetResult<T>
    data class Invalid(val message: String) : AssetResult<Nothing>
    data object NotFound : AssetResult<Nothing>
    data object Unavailable : AssetResult<Nothing>
}

/**
 * Every file of a project goes through here: the owner requests a presigned PUT, uploads, then
 * confirms. Each upload is checked against its type's [AssetRule]. A file keeps its key, and its
 * URL carries the version of the last confirmed upload.
 */
class AssetService(
    private val s3: S3Signer?,
    private val bucketName: String,
    private val bucketBaseUrl: String,
    // Checks the uploaded object against its rule on confirm. Without it, confirm trusts the request.
    private val inspector: S3Inspector? = null,
    private val cleanup: AssetCleanupService? = null
) {
    /** The confirmed files of the user's live projects and levels. */
    fun listConfirmed(userId: String): List<Asset> = transaction {
        liveAssets().andWhere { (AssetsTable.userId eq userId) and (AssetsTable.confirmed eq true) }.map { it.toAsset() }
    }

    /** The confirmed files of a project and its live levels, whoever owns them. */
    fun listConfirmedForProject(projectId: String): List<Asset> = transaction {
        liveAssets().andWhere { (AssetsTable.projectId eq projectId) and (AssetsTable.confirmed eq true) }.map { it.toAsset() }
    }

    fun requestUploadUrl(userId: String, req: UploadUrlRequest): AssetResult<UploadUrlResponse> {
        if (s3 == null) return AssetResult.Unavailable
        AssetTypes.problem(req.assetType, req.levelId, req.filename, req.contentType, req.size)
            ?.let { return AssetResult.Invalid(it) }

        return transaction {
            // A deleted project or level takes no new files: they would outlive its cleanup.
            val project = ProjectsTable.selectAll()
                .where { (ProjectsTable.id eq req.projectId) and (ProjectsTable.userId eq userId) and ProjectsTable.deletedAt.isNull() }
                .any()
            val level = req.levelId == null || LevelsTable.selectAll()
                .where {
                    (LevelsTable.id eq req.levelId) and (LevelsTable.projectId eq req.projectId) and
                        (LevelsTable.userId eq userId) and LevelsTable.deletedAt.isNull()
                }
                .any()
            if (!project || !level) return@transaction AssetResult.NotFound

            val storageKey = StorageKeys.asset(userId, req.projectId, req.levelId, req.assetType, req.filename)
            val now = System.currentTimeMillis()
            val existing = AssetsTable.selectAll().where { AssetsTable.storageKey eq storageKey }.any()

            if (!existing) {
                AssetsTable.insert {
                    it[id] = UUID.randomUUID().toString()
                    it[AssetsTable.userId] = userId
                    it[projectId] = req.projectId
                    it[levelId] = req.levelId
                    it[assetType] = req.assetType
                    it[filename] = req.filename
                    it[AssetsTable.storageKey] = storageKey
                    it[contentType] = req.contentType
                    it[confirmed] = false
                    it[createdAt] = now
                }
            } else {
                // A re-upload: the confirmed file stays listed, as it was, until the new one is confirmed.
                AssetsTable.update({ AssetsTable.storageKey eq storageKey }) {
                    it[createdAt] = now
                }
            }

            AssetResult.Success(
                UploadUrlResponse(
                    uploadUrl = s3.presignPut(bucketName, storageKey, contentType = req.contentType),
                    publicUrl = "$bucketBaseUrl/$storageKey",
                    storageKey = storageKey
                )
            )
        }
    }

    /** Marks the user's upload as the file's new version, once the object passes its type's rule. */
    fun confirmUpload(userId: String, storageKey: String): AssetResult<Asset> {
        val row = transaction {
            AssetsTable.selectAll()
                .where { (AssetsTable.storageKey eq storageKey) and (AssetsTable.userId eq userId) }
                .firstOrNull()
        } ?: return AssetResult.NotFound

        var uploadedType = row[AssetsTable.contentType]
        if (inspector != null) {
            val rule = AssetTypes.rule(row[AssetsTable.assetType])
            val head = inspector.head(bucketName, storageKey) ?: return AssetResult.Invalid("The file was not uploaded")
            val problem = when {
                rule == null -> "Unknown asset type"
                head.size > rule.maxBytes -> "The file is larger than its type allows"
                head.contentType !in rule.contentTypes -> rule.wrongTypeMessage
                else -> null
            }
            if (problem != null) {
                cleanup?.deleteObject(storageKey)
                transaction { AssetsTable.deleteWhere { AssetsTable.storageKey eq storageKey } }
                return AssetResult.Invalid(problem)
            }
            uploadedType = head.contentType!!
        }

        return transaction {
            AssetsTable.update({ AssetsTable.storageKey eq storageKey }) {
                it[confirmed] = true
                it[contentType] = uploadedType
                it[updatedAt] = System.currentTimeMillis()
            }
            purgeStaleUnconfirmed()
            AssetsTable.selectAll().where { AssetsTable.storageKey eq storageKey }.first().toAsset()
        }.let { AssetResult.Success(it) }
    }

    // Leaves out files of tombstoned projects and levels.
    private fun liveAssets() = AssetsTable
        .join(ProjectsTable, JoinType.INNER, AssetsTable.projectId, ProjectsTable.id)
        .join(LevelsTable, JoinType.LEFT, AssetsTable.levelId, LevelsTable.id)
        .selectAll()
        .andWhere { ProjectsTable.deletedAt.isNull() and (AssetsTable.levelId.isNull() or LevelsTable.deletedAt.isNull()) }

    private fun purgeStaleUnconfirmed() {
        val cutoff = System.currentTimeMillis() - ONE_HOUR_MS
        AssetsTable.deleteWhere {
            (confirmed eq false) and (createdAt less cutoff) and (updatedAt eq 0L)
        }
    }

    private fun ResultRow.toAsset() = Asset(
        id = this[AssetsTable.id],
        projectId = this[AssetsTable.projectId],
        levelId = this[AssetsTable.levelId],
        assetType = this[AssetsTable.assetType],
        filename = this[AssetsTable.filename],
        contentType = this[AssetsTable.contentType],
        publicUrl = assetUrl(bucketBaseUrl, this[AssetsTable.storageKey], this[AssetsTable.updatedAt]),
        updatedAt = this[AssetsTable.updatedAt]
    )
}

fun assetUrl(bucketBaseUrl: String, storageKey: String, version: Long) = "$bucketBaseUrl/$storageKey?v=$version"

/** The image URL of each of [projectIds] that has a confirmed image. Call inside a transaction. */
fun projectImageUrls(bucketBaseUrl: String, projectIds: Collection<String>): Map<String, String> {
    if (projectIds.isEmpty()) return emptyMap()
    return AssetsTable.selectAll()
        .where {
            (AssetsTable.projectId inList projectIds) and AssetsTable.levelId.isNull() and
                (AssetsTable.assetType eq AssetTypes.IMAGE) and (AssetsTable.confirmed eq true)
        }
        .associate {
            it[AssetsTable.projectId] to assetUrl(bucketBaseUrl, it[AssetsTable.storageKey], it[AssetsTable.updatedAt])
        }
}
