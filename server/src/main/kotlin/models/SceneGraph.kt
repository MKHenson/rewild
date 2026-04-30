package com.rewild.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// PropValue is a TS union (string | boolean | number | Vector3 | object).
// JsonElement accepts any valid JSON value, which covers all members of that union.
typealias PropValue = JsonElement

@Serializable
data class Atmosphere(
    val elevation: PropValue,
    val cloudiness: PropValue,
    val foginess: PropValue,
    val windiness: PropValue,
    val precipitation: PropValue,
    val temperature: PropValue,
    val dayNightCycle: PropValue
)

@Serializable
data class Asset3D(
    val id: String,
    val position: Vector3,
    val rotation: Vector4
)

@Serializable
data class ContainerPod(
    val asset3D: List<Asset3D>
)

interface Resource {
    val id: String
    val name: String
    val type: String
    val properties: List<JsonElement>?
    val templateId: String?
}

@Serializable
data class Actor(
    override val id: String,
    override val name: String,
    override val type: String,
    override val properties: List<JsonElement>? = null,
    override val templateId: String? = null
) : Resource

@Serializable
data class Container(
    override val id: String,
    override val name: String,
    override val type: String,
    override val properties: List<JsonElement>? = null,
    override val templateId: String? = null,
    val activeOnStartup: Boolean,
    val pod: ContainerPod,
    val actors: List<Actor>
) : Resource

@Serializable
data class SceneGraph(
    val containers: List<Container>,
    val atmosphere: Atmosphere
)
