package com.rewild.auth

object UserRole {
    const val USER = "user"
    const val SUPER_ADMIN = "super_admin"

    val all = setOf(USER, SUPER_ADMIN)
}
