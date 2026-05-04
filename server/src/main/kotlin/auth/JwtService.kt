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

    fun generateToken(userId: String, email: String): String =
        JWT.create()
            .withIssuer(issuer)
            .withAudience(audience)
            .withClaim("userId", userId)
            .withClaim("email", email)
            .withExpiresAt(Date.from(Instant.now().plusSeconds(15 * 60)))
            .sign(algorithm)

    fun makeVerifier(): JWTVerifier =
        JWT.require(algorithm)
            .withAudience(audience)
            .withIssuer(issuer)
            .build()
}
