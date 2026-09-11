// Image-based ambient from the prefiltered sky — the second half of the split
// sum, evaluated at shading time.
//
// This replaces the flat `ambientColor` constant the standard material used to
// add at the end. That constant had to be authored per material and knew
// nothing about the sky; this tracks time of day and weather for free, because
// the atmosphere model it is captured from already does.
//
// Requires from the including shader — by these exact names, at whatever group
// and binding its own layout puts them:
//   - iblIrradianceMap, iblSpecularMap, iblBrdfLut, iblSampler, iblParams
//   - brdf.wgsl, for fresnelSchlickRoughness
//   - pbr-lighting.wgsl, for the PbrSurface struct
//
// Everything here works from a view-space surface, because that is the space
// the material passes shade in — but the cubes are world-space, so directions
// are rotated out through iblParams.viewToWorld before they are sampled.

struct IblParams {
  /**
   * The camera's world matrix. Only the upper 3x3 is used, and only on
   * direction vectors (w = 0), so a camera with no scale — which is every
   * camera — makes this a pure rotation.
   */
  viewToWorld: mat4x4f,
  /**
   * Global multiplier on both ambient terms. 1 is the physical answer; 0 turns
   * IBL off outright, which is how setIblEnabled(false) separates a
   * direct-lighting bug from an ambient one.
   */
  intensity: f32,
  /**
   * Highest mip index of the prefiltered specular cube, i.e. the level standing
   * for roughness 1. Supplied rather than assumed so the chain length lives in
   * one place — SkyCubeCapture's SKY_CUBE_MIP_COUNT.
   */
  maxSpecularMip: f32,
  /**
   * Material debug channel 0 shades normally; anything else short-
   * circuits the material to one of its inputs. See material-debug.wgsl.
   */
  debugChannel: u32,
  /**
   * Reciprocal of the camera exposure. A debug channel is a 0..1 quantity, and
   * the frame tonemap multiplies by exposure before ACES — so scaling by this
   * first makes the curve see the raw value rather than crushing it to black.
   */
  debugScale: f32,
}

/**
 * Ambient radiance arriving at `surface`, diffuse plus specular.
 *
 * Returned before occlusion is applied: glTF scopes the occlusion map to
 * indirect light, and this is the only indirect term, so the caller multiplies
 * the whole thing by it.
 *
 * `perceptualRoughness` is the material's authored roughness, not
 * surface.alpha — the prefiltered chain is indexed by the perceptual value, and
 * so is the BRDF map.
 */
fn evaluateIbl(surface: PbrSurface, perceptualRoughness: f32) -> vec3f {
  let viewToWorld = iblParams.viewToWorld;

  // Irradiance is gathered along the shading normal and the reflection is
  // taken along the specular one; see PbrSurface for when they differ.
  let N = surface.normal;
  let Ns = surface.specularNormal;
  let V = normalize(-surface.viewPosition);
  // abs() for the same reason evaluateBRDF uses it: normal mapping pushes N
  // past the silhouette, and a NoV pinned at zero there makes the Fresnel
  // ceiling snap to white on exactly the fragments that show it most.
  let NoV = clamp(abs(dot(Ns, V)), 1e-4, 1.0);

  let worldN = normalize((viewToWorld * vec4f(N, 0.0)).xyz);
  // Reflecting in view space and rotating the result costs one transform rather
  // than two, and is identical for a rotation.
  let worldR = normalize((viewToWorld * vec4f(reflect(-V, Ns), 0.0)).xyz);

  // The irradiance cube already holds irradiance/pi, so it multiplies the
  // diffuse colour directly — no further division, and no cosine, both having
  // been folded in by the cosine-weighted convolution that produced it.
  let irradiance = textureSampleLevel(iblIrradianceMap, iblSampler, worldN, 0.0).rgb;
  // Roughness maps linearly onto the chain, matching how the prefilter assigned
  // roughness to each level (mip m holds m / maxSpecularMip). Sampled with an
  // explicit level so the hardware's own derivative-based choice, which would
  // be meaningless for a direction vector, never enters into it.
  let lod = clamp(perceptualRoughness, 0.0, 1.0) * iblParams.maxSpecularMip;
  let prefiltered = textureSampleLevel(iblSpecularMap, iblSampler, worldR, lod).rgb;

  // The split sum's second factor: scale and bias for F0, integrated over the
  // BRDF alone. Convention fixed by iblBrdfLut.wgsl — x is NdotV, y is
  // roughness.
  let ab = textureSampleLevel(
    iblBrdfLut, iblSampler, vec2f(NoV, clamp(perceptualRoughness, 0.0, 1.0)), 0.0
  ).rg;
  // Horizon occlusion, for the same reason the direct path applies it: the
  // reflection vector can point below the geometry once a normal map has tilted
  // N, and the prefiltered cube will happily return sky from down there.
  let horizon = horizonOcclusion(reflect(-V, Ns), surface.geometricNormal);

  // Single-scattering reflectance: the fraction of incoming light that leaves
  // after exactly one bounce off a microfacet.
  let kS = fresnelSchlickRoughness(surface.f0, NoV, perceptualRoughness);
  let FssEss = kS * ab.x + ab.y;

  // Multiple scattering (Fdez-Agüera 2019).
  let Ems = 1.0 - (ab.x + ab.y);
  let Favg = surface.f0 + (1.0 - surface.f0) / 21.0;
  // The denominator reaches zero for a perfect mirror (F0 = 1) that loses all
  // its energy — physically unreachable, numerically one division away.
  let FmsEms = Ems * FssEss * Favg / max(vec3f(1.0) - Favg * Ems, vec3f(1e-4));

  // What is left for the diffuse lobe once both scattering terms have taken
  // their share. surface.diffuseColor is already scaled by (1 - metallic), so a
  // metal contributes nothing here and must not be scaled by it twice.
  let kD = surface.diffuseColor * (1.0 - FssEss + FmsEms);

  let specular = prefiltered * FssEss * horizon;
  let diffuse = (FmsEms + kD) * irradiance;

  return (diffuse + specular) * iblParams.intensity;
}
