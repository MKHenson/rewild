package com.rewild.projects

import com.rewild.assets.AssetCleanupService
import com.rewild.assets.S3Inspector
import com.rewild.assets.S3Signer
import com.rewild.assets.StorageKeys
import com.rewild.db.tables.ProjectsTable
import com.rewild.models.ProjectImageResponse
import com.rewild.models.UploadUrlResponse
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import java.util.UUID

const val MAX_PROJECT_IMAGE_BYTES = 2L * 1024 * 1024

private val IMAGE_EXTENSIONS = mapOf(
    "image/png" to "png",
    "image/jpeg" to "jpg",
    "image/webp" to "webp"
)

private const val WRONG_TYPE = "The image must be a PNG, JPEG or WebP file"
private const val TOO_LARGE = "The image must be 2 MB or smaller"

sealed interface ImageResult<out T> {
    data class Success<T>(val value: T) : ImageResult<T>
    data object NotFound : ImageResult<Nothing>
    data object Forbidden : ImageResult<Nothing>
    data class Invalid(val message: String) : ImageResult<Nothing>
    data object Unavailable : ImageResult<Nothing>
}

// Project images go straight to the bucket: the owner requests a presigned PUT, uploads,
// then confirms. Each upload gets a new key, so no cache can serve an old image.
class ProjectImageService(
    private val signer: S3Signer?,
    private val inspector: S3Inspector?,
    private val bucketName: String,
    private val bucketBaseUrl: String,
    private val cleanup: AssetCleanupService? = null
) {
    fun requestUploadUrl(userId: String, projectId: String, contentType: String, size: Long): ImageResult<UploadUrlResponse> {
        if (signer == null) return ImageResult.Unavailable
        checkOwner(userId, projectId)?.let { return it }

        val extension = IMAGE_EXTENSIONS[contentType] ?: return ImageResult.Invalid(WRONG_TYPE)
        if (size <= 0 || size > MAX_PROJECT_IMAGE_BYTES) return ImageResult.Invalid(TOO_LARGE)

        val storageKey = "${StorageKeys.image(userId, projectId)}${UUID.randomUUID()}.$extension"
        val uploadUrl = signer.presignPut(bucketName, storageKey, contentType = contentType)
        return ImageResult.Success(
            UploadUrlResponse(uploadUrl = uploadUrl, publicUrl = "$bucketBaseUrl/$storageKey", storageKey = storageKey)
        )
    }

    fun confirmUpload(userId: String, projectId: String, storageKey: String): ImageResult<ProjectImageResponse> {
        if (inspector == null) return ImageResult.Unavailable
        checkOwner(userId, projectId)?.let { return it }

        val prefix = StorageKeys.image(userId, projectId)
        val ownKey = Regex("^${Regex.escape(prefix)}[0-9a-f-]{36}\\.(png|jpg|webp)$")
        if (!ownKey.matches(storageKey)) return ImageResult.Invalid("Not an image upload of this project")

        val head = inspector.head(bucketName, storageKey)
            ?: return ImageResult.Invalid("The image was not uploaded")
        val rejection = when {
            head.size > MAX_PROJECT_IMAGE_BYTES -> TOO_LARGE
            head.contentType !in IMAGE_EXTENSIONS -> WRONG_TYPE
            else -> null
        }
        if (rejection != null) {
            cleanup?.deleteObject(storageKey)
            return ImageResult.Invalid(rejection)
        }

        var previous: String? = null
        val stored = transaction {
            val row = ProjectsTable.selectAll()
                .where { ProjectsTable.id eq projectId }
                .firstOrNull()
            if (row == null || row[ProjectsTable.deletedAt] != null || row[ProjectsTable.userId] != userId) {
                return@transaction false
            }

            previous = row[ProjectsTable.imageKey]
            val now = System.currentTimeMillis()
            // A newer updatedAt lets the owner's other devices pull the new image URL.
            ProjectsTable.update({ ProjectsTable.id eq projectId }) {
                it[imageKey] = storageKey
                it[updatedAt] = maxOf(row[updatedAt] + 1, now)
                it[syncedAt] = now
            }
            true
        }
        if (!stored) {
            cleanup?.deleteObject(storageKey)
            return ImageResult.NotFound
        }

        previous?.takeIf { it != storageKey }?.let { cleanup?.deleteObject(it) }
        return ImageResult.Success(ProjectImageResponse(imageUrl = "$bucketBaseUrl/$storageKey"))
    }

    private fun checkOwner(userId: String, projectId: String): ImageResult<Nothing>? = transaction {
        val row = ProjectsTable.selectAll()
            .where { ProjectsTable.id eq projectId }
            .firstOrNull()
        when {
            row == null || row[ProjectsTable.deletedAt] != null -> ImageResult.NotFound
            row[ProjectsTable.userId] != userId -> ImageResult.Forbidden
            else -> null
        }
    }
}
