package com.rewild.assets

/** Where in a project an asset lives: on the project itself, or on one of its levels. */
enum class AssetScope { PROJECT, LEVEL }

/** What an asset type allows. Every upload is checked against its type's rule. */
data class AssetRule(
    val scope: AssetScope,
    val contentTypes: Set<String>,
    val maxBytes: Long,
    val filename: Regex,
    // The message for a content type outside [contentTypes].
    val wrongTypeMessage: String,
)

private const val MB = 1024L * 1024

object AssetTypes {
    /** A level's terrain, paint, scatter and water files. */
    const val CHUNK = "chunk"

    /** The project image. One per project, so its filename is fixed. */
    const val IMAGE = "image"

    /** A level seen from its PlayerStart, shown by portals that lead to it. One per level. */
    const val PORTAL_VIEW = "portal-view"

    const val BINARY = "application/octet-stream"

    private val rules = mapOf(
        CHUNK to AssetRule(
            scope = AssetScope.LEVEL,
            contentTypes = setOf(BINARY),
            maxBytes = 16 * MB,
            filename = Regex("^[A-Za-z0-9_.-]{1,128}$"),
            wrongTypeMessage = "A chunk file must be binary",
        ),
        IMAGE to AssetRule(
            scope = AssetScope.PROJECT,
            contentTypes = setOf("image/png", "image/jpeg", "image/webp"),
            maxBytes = 2 * MB,
            filename = Regex("^image$"),
            wrongTypeMessage = "The image must be a PNG, JPEG or WebP file",
        ),
        PORTAL_VIEW to AssetRule(
            scope = AssetScope.LEVEL,
            contentTypes = setOf("image/png", "image/webp"),
            maxBytes = 8 * MB,
            filename = Regex("^view$"),
            wrongTypeMessage = "A portal view must be a PNG or WebP file",
        ),
    )

    fun rule(assetType: String): AssetRule? = rules[assetType]

    /** Why an upload breaks its type's rule, or null when it does not. */
    fun problem(assetType: String, levelId: String?, filename: String, contentType: String, size: Long): String? {
        val rule = rule(assetType) ?: return "Unknown asset type"
        return when {
            rule.scope == AssetScope.LEVEL && levelId == null -> "This asset type belongs to a level"
            rule.scope == AssetScope.PROJECT && levelId != null -> "This asset type belongs to the project, not a level"
            !rule.filename.matches(filename) -> "Invalid filename"
            contentType !in rule.contentTypes -> rule.wrongTypeMessage
            size <= 0 || size > rule.maxBytes -> "The file must be ${rule.maxBytes / MB} MB or smaller"
            else -> null
        }
    }
}
