package com.rewild.auth

import kotlinx.serialization.Serializable

@Serializable
data class RegisterRequest(val email: String, val password: String, val displayName: String)

@Serializable
data class GoogleAuthRequest(val idToken: String)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class AuthResponse(val token: String)

@Serializable
data class ForgotPasswordRequest(val email: String)

@Serializable
data class ResetPasswordRequest(val token: String, val password: String)
