package com.rewild.common

import kotlinx.serialization.Serializable

@Serializable
data class ErrorResponse(val error: String)
