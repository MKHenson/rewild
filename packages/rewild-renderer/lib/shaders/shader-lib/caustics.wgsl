// The sun's light focused by the waves on what lies under water (Caustics),
// from a texture over one cascade's tile holding two planes below the
// surface. The host declares `causticsMap`, `causticsSampler` and
// `caustics : CausticsParams`.

// The cascade whose tile the caustics cover. Mirrors CAUSTIC_CASCADE in
// Caustics.ts.
const CAUSTIC_CASCADE: i32 = 3;
// Texels per side of the texture. Mirrors CAUSTIC_TEXELS in Caustics.ts.
const CAUSTIC_TEXELS: f32 = 512.0;
// Radians a screen pixel spans, near enough for every view: picks the mip
// whose texels match a pixel's footprint at a distance.
const CAUSTIC_PIXEL_ANGLE: f32 = 0.0012;
// View metres over which the caustics fade out.
const CAUSTIC_FADE_NEAR: f32 = 40.0;
const CAUSTIC_FADE_FAR: f32 = 120.0;

struct CausticsParams {
  // xy: the camera's place in the tile, 0..1. z: 1 over the tile's metres.
  // w: strength 0..1; 0 while the sun is down.
  tile : vec4f,
  // xy: metres along xz back toward the refracted sun per metre of depth.
  // z, w: metres down to the shallow and deep planes.
  sun : vec4f,
  // x: the camera's water's weight on the cascade.
  water : vec4f,
}

// The place in the tile of a point `offset` metres in xz from the camera.
fn causticsPlace(offset: vec2f) -> vec2f {
  return caustics.tile.xy + offset * caustics.tile.z;
}

// What the waves make of the sun's light `depth` metres under the surface, at
// `place` in the tile (causticsPlace, or cascadeUV of CAUSTIC_CASCADE),
// `distance` metres from the camera, in water that takes `weight` of the
// cascade. 1 is what a calm surface lets through. The pattern grows from none
// at the surface to the shallow plane's, blends to the deep plane's, and
// fades out below it.
fn causticLight(place: vec2f, depth: f32, distance: f32, weight: f32) -> f32 {
  let strength = caustics.tile.w * weight * (1.0 - smoothstep(CAUSTIC_FADE_NEAR, CAUSTIC_FADE_FAR, distance));
  if (strength <= 0.0 || depth <= 0.0) {
    return 1.0;
  }
  let uv = place + caustics.sun.xy * depth * caustics.tile.z;
  let footprint = distance * CAUSTIC_PIXEL_ANGLE * CAUSTIC_TEXELS * caustics.tile.z;
  let lod = max(log2(max(footprint, 1e-6)), 0.0);
  let planes = textureSampleLevel(causticsMap, causticsSampler, uv, lod).rg;
  let shallow = caustics.sun.z;
  let deep = caustics.sun.w;
  let near = mix(1.0, planes.r, saturate(depth / shallow));
  let light = mix(near, planes.g, saturate((depth - shallow) / (deep - shallow)));
  let fade = exp(-max(depth - deep, 0.0) / deep);
  return max(1.0 + (light - 1.0) * strength * fade, 0.0);
}
