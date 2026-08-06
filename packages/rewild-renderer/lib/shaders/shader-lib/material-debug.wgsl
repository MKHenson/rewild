// Scene-wide material channel visualisation (#203).
//
// Shading has too many places to hide a mistake. A mis-declared colour space, a
// flipped normal-map green channel and a roughness map that never loaded all
// present the same way — "it looks a bit off" — and all three are obvious the
// moment the channel is shown on its own. This is the difference between
// measuring and arguing about it.
//
// Shared by standard-material.wgsl and terrain.wgsl so both answer the same
// question the same way. The caller supplies its own channels, because what
// they are made of differs — terrain blends its across splat layers while a
// standard material samples its from one texture set — but what they *mean* is
// identical, and that is what makes comparing the two worth anything.
//
// Requires from the including shader:
//   - ibl.wgsl, for the iblParams block this reads the channel and scale from

const DEBUG_CHANNEL_OFF      : u32 = 0u;
const DEBUG_CHANNEL_BASECOLOR: u32 = 1u;
const DEBUG_CHANNEL_METALLIC : u32 = 2u;
const DEBUG_CHANNEL_ROUGHNESS: u32 = 3u;
const DEBUG_CHANNEL_NORMAL   : u32 = 4u;
const DEBUG_CHANNEL_AO       : u32 = 5u;
const DEBUG_CHANNEL_EMISSIVE : u32 = 6u;
// Not PBR inputs but the same question asked of the output: which light source
// is responsible for what is on screen. Added because "is this the sun or the
// sky?" is not answerable from the final image, and guessing at it is expensive.
const DEBUG_CHANNEL_DIRECT   : u32 = 7u;
const DEBUG_CHANNEL_INDIRECT : u32 = 8u;

/**
 * The requested channel as a displayable colour, pre-scaled so the frame
 * tonemap passes it through rather than crushing it.
 *
 * `viewNormal` is view space, as both material paths shade in. It is remapped
 * to 0..1 for display, so a surface facing the camera reads light blue-grey and
 * a flipped green channel shows as a red/green swap in the relief.
 *
 * `direct` and `indirect` are already-shaded radiance rather than inputs, so
 * they are *not* scaled — they are compared against each other and against the
 * final image, which means they have to stay on the same scale as it.
 */
fn materialDebugColor(
  basecolor: vec3f,
  metallic: f32,
  roughness: f32,
  viewNormal: vec3f,
  occlusion: f32,
  emissive: vec3f,
  direct: vec3f,
  indirect: vec3f
) -> vec4f {
  let scale = iblParams.debugScale;

  switch (iblParams.debugChannel) {
    case 1u: { return vec4f(basecolor * scale, 1.0); }
    case 2u: { return vec4f(vec3f(metallic) * scale, 1.0); }
    case 3u: { return vec4f(vec3f(roughness) * scale, 1.0); }
    case 4u: { return vec4f((normalize(viewNormal) * 0.5 + 0.5) * scale, 1.0); }
    case 5u: { return vec4f(vec3f(occlusion) * scale, 1.0); }
    case 6u: { return vec4f(emissive * scale, 1.0); }
    case 7u: { return vec4f(direct, 1.0); }
    case 8u: { return vec4f(indirect, 1.0); }
    default: { return vec4f(basecolor * scale, 1.0); }
  }
}
