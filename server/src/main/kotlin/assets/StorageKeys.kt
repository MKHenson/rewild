package com.rewild.assets

// Bucket layout: every file of a project lives under its project prefix.
object StorageKeys {
    fun project(userId: String, projectId: String) = "users/$userId/projects/$projectId/"

    fun level(userId: String, projectId: String, levelId: String) = "${project(userId, projectId)}levels/$levelId/"

    fun image(userId: String, projectId: String) = "${project(userId, projectId)}image/"
}
