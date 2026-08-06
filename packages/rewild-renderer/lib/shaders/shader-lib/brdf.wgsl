// Metallic-roughness BRDF, to the glTF 2.0 spec's Appendix B: GGX
// (Trowbridge-Reitz) distribution, Smith height-correlated visibility, Schlick
// Fresnel, Lambert diffuse.
//
// Pure maths — no bindings, no globals, nothing that knows about lights. It is
// its own include so that the light loop, the reference harness and (later) the
// IBL prefilter all call the same functions rather than each carrying a copy
// that drifts. Everything works in whatever space the caller supplies; the
// material passes work in view space.

const BRDF_PI: f32 = 3.14159265359;

// glTF authors *perceptual* roughness; the BRDF wants alpha = roughness².
//
// The floor is not cosmetic. At alpha = 0 the GGX denominator collapses to zero
// exactly on the mirror direction, which in f32 gives inf, and inf * 0 from a
// zero-weighted light is NaN — one black pixel that survives every later blend.
// 0.045 is about the smallest value that stays finite here and still reads as a
// sharp mirror.
const MIN_PERCEPTUAL_ROUGHNESS: f32 = 0.045;

// Normal-incidence reflectance of common dielectrics. glTF fixes this at 4%
// rather than letting the artist author it; KHR_materials_specular is what
// makes it variable, and that is out of scope (see the milestone's non-goals).
const DIELECTRIC_F0: vec3f = vec3f(0.04, 0.04, 0.04);

struct BrdfSample {
  diffuse: vec3f,
  specular: vec3f,
}

fn perceptualRoughnessToAlpha(perceptualRoughness: f32) -> f32 {
  let r = clamp(perceptualRoughness, MIN_PERCEPTUAL_ROUGHNESS, 1.0);
  return r * r;
}

// A metal has no diffuse lobe at all — its base colour tints its *specular*
// instead. A dielectric does the opposite. `metallic` interpolates, which is
// only physically meaningful at 0 or 1; values between exist so a single
// texture can cover a surface that is partly both.
fn diffuseColorFromBaseColor(baseColor: vec3f, metallic: f32) -> vec3f {
  return baseColor * (1.0 - metallic);
}

fn f0FromBaseColor(baseColor: vec3f, metallic: f32) -> vec3f {
  return mix(DIELECTRIC_F0, baseColor, metallic);
}

// GGX / Trowbridge-Reitz microfacet distribution.
fn distributionGGX(NoH: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / max(BRDF_PI * d * d, 1e-7);
}

// Smith height-correlated visibility. This is the geometry term *already
// divided* by the microfacet denominator's 4·NoL·NoV, which is why the specular
// assembly below is just D · Vis · F with no further division. Height-correlated
// rather than separable because the two shadowing terms are not independent —
// separable Smith over-darkens grazing angles at high roughness.
fn visibilitySmithGGXCorrelated(NoV: f32, NoL: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let lambdaV = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  let lambdaL = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(lambdaV + lambdaL, 1e-7);
}

fn fresnelSchlick(f0: vec3f, VoH: f32) -> vec3f {
  let f = pow(clamp(1.0 - VoH, 0.0, 1.0), 5.0);
  return f0 + (vec3f(1.0) - f0) * f;
}

// Fresnel for an environment rather than a single light.
//
// A punctual light has one half-vector, so plain Schlick is exact. Ambient
// arrives from the whole hemisphere at once, and applying Schlick to the view
// angle alone puts a bright rim on every silhouette regardless of how rough the
// surface is — a sanded surface would ring like chrome. Ceiling the reflectance
// at (1 - roughness) removes that: rough surfaces stop gaining anything at
// grazing angles, smooth ones are unaffected. Sébastien Lagarde's fit.
fn fresnelSchlickRoughness(f0: vec3f, NoV: f32, perceptualRoughness: f32) -> vec3f {
  let f = pow(clamp(1.0 - NoV, 0.0, 1.0), 5.0);
  let ceiling = max(vec3f(1.0 - perceptualRoughness), f0);
  return f0 + (ceiling - f0) * f;
}

fn diffuseLambert(diffuseColor: vec3f) -> vec3f {
  return diffuseColor / BRDF_PI;
}

// One light's contribution, for a unit-radiance light arriving along `L`.
//
// Both terms come back already weighted by N·L, so a caller multiplies by
// (light colour × intensity × attenuation) and adds. Returns zero for a light
// below the horizon rather than clamping, so back-facing lights cost nothing.
//
// N, V and L must be normalized. V points from the surface toward the eye.
fn evaluateBRDF(
  N: vec3f,
  V: vec3f,
  L: vec3f,
  diffuseColor: vec3f,
  f0: vec3f,
  alpha: f32
) -> BrdfSample {
  var result: BrdfSample;
  result.diffuse = vec3f(0.0);
  result.specular = vec3f(0.0);

  let NoL = clamp(dot(N, L), 0.0, 1.0);
  if (NoL <= 0.0) {
    return result;
  }

  let H = normalize(L + V);
  // abs() rather than max(_, 0): normal mapping and vertex interpolation both
  // push N past the silhouette, and a NoV pinned to zero there makes the
  // visibility term blow up instead of merely grazing.
  let NoV = clamp(abs(dot(N, V)), 1e-4, 1.0);
  let NoH = clamp(dot(N, H), 0.0, 1.0);
  let VoH = clamp(dot(V, H), 0.0, 1.0);

  let D = distributionGGX(NoH, alpha);
  let Vis = visibilitySmithGGXCorrelated(NoV, NoL, alpha);
  let F = fresnelSchlick(f0, VoH);

  // Energy split: light Fresnel reflects off the surface cannot also refract
  // into it and come back out as diffuse. This is what stops a rough metal
  // being brighter than the light hitting it.
  let kD = vec3f(1.0) - F;

  result.diffuse = kD * diffuseLambert(diffuseColor) * NoL;
  result.specular = F * (D * Vis) * NoL;
  return result;
}
