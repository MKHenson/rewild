package com.rewild.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.interfaces.JWTVerifier
import java.time.Instant
import java.util.Date

class JwtService(
    private val secret: String,
    val issuer: String,
    val audience: String
) {
    private val algorithm = Algorithm.HMAC256(secret)

    fun generateToken(
        userId: String,
        email: String,
        displayName: String,
        photoUrl: String? = null,
        role: String = UserRole.USER,
    ): String =
        JWT.create()
            .withIssuer(issuer)
            .withAudience(audience)
            .withClaim("userId", userId)
            .withClaim("email", email)
            .withClaim("displayName", displayName)
            .withClaim("role", role)
            .apply { if (photoUrl != null) withClaim("photoUrl", photoUrl) }
            .withExpiresAt(Date.from(Instant.now().plusSeconds(15 * 60)))
            .sign(algorithm)

    fun makeVerifier(): JWTVerifier =
        JWT.require(algorithm)
            .withAudience(audience)
            .withIssuer(issuer)
            .build()
}
