package com.rewild.auth

import kotlinx.serialization.Serializable

@Serializable
data class RegisterRequest(val email: String, val password: String, val username: String)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class AuthResponse(val token: String)
