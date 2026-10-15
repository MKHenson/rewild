package com.rewild.assets

// Bucket layout: every file of a project lives under its project prefix.
object StorageKeys {
    fun project(userId: String, projectId: String) = "users/$userId/projects/$projectId/"

    fun level(userId: String, projectId: String, levelId: String) = "${project(userId, projectId)}levels/$levelId/"

    /** A project file sits under the project, a level file under its level. */
    fun asset(userId: String, projectId: String, levelId: String?, assetType: String, filename: String): String {
        val parent = if (levelId == null) project(userId, projectId) else level(userId, projectId, levelId)
        return "$parent$assetType/$filename"
    }
}
