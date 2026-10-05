package com.rewild.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

// PropValue is a TS union (string | boolean | number | Vector3 | object).
// JsonElement accepts any valid JSON value, which covers all members of that union.
typealias PropValue = JsonElement

@Serializable
data class Atmosphere(
    val elevation: PropValue,
    val cloudiness: PropValue,
    val foginess: PropValue,
    val windiness: PropValue,
    // Bearing in degrees the air moves toward. Defaulted so older records deserialize.
    val windDirection: PropValue = JsonPrimitive(180),
    val precipitation: PropValue,
    val temperature: PropValue,
    val dayNightCycle: PropValue,
    // A weather state id to start in, or "auto". Defaulted so older records deserialize.
    val weatherState: PropValue = JsonPrimitive("auto"),
    // 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. Defaulted so older records deserialize.
    val moonPhase: PropValue = JsonPrimitive(0.5),
    // Picks a moon phase at random on load. Defaulted so older records deserialize.
    val randomMoonPhase: PropValue = JsonPrimitive(false)
)

@Serializable
data class Asset3D(
    val id: String,
    val position: Vector3,
    val rotation: Vector4,
    // Terrain-relative placement
    val conform: Boolean = false,
    val yOffset: Float = 0f,
    val alignToNormal: Float = 0f
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
data class WorldGenConfig(
    val version: Int,
    val seed: Int,
    // Id of a code-defined climate preset; the preset's tables are game
    // content and are never persisted. Defaulted so older records deserialize.
    val climatePreset: String = "default",
    // World height of the ocean surface, in metres.
    val seaLevel: Float = 0f
)

@Serializable
data class SceneGraph(
    val containers: List<Container>,
    val atmosphere: Atmosphere,
    val terrain: WorldGenConfig? = null
)
