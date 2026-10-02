// Light along a ray through the water (UnderWater): what survives the trip,
// and what the water scatters into it. Light at depth z has crossed z / μ
// metres of water from the sun and WATER_SKY_SLANT × z from the sky. The bed
// returns WATER_BED_ALBEDO of what reaches it, which rises WATER_SKY_SLANT ×
// its height above the bed, so shallow water glows with the light off its
// bed and deep water does not. The water scatters its palette's in-water
// glow times the extinction. The host includes under-water.wgsl.

// Henyey-Greenstein forward scattering blended with isotropic, so the water
// glows toward the sun.
const WATER_PHASE_G: f32 = 0.85;
const WATER_PHASE_ISOTROPIC: f32 = 0.25;
// Diffuse light's slant path through the water, over the depth.
const WATER_SKY_SLANT: f32 = 1.2;
// Share of the light reaching the bed it returns: sand and silt.
const WATER_BED_ALBEDO: f32 = 0.3;
const WATER_PI: f32 = 3.14159265;

// The phase function, times 4π, so isotropic scattering is 1.
fn waterPhase(cosTheta: f32) -> f32 {
  let g = WATER_PHASE_G;
  let hg = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * cosTheta, 1e-4), 1.5);
  return mix(hg, 1.0, WATER_PHASE_ISOTROPIC);
}

// The share of light that survives `distance` metres of water.
fn waterTransmittanceAlong(distance: f32) -> vec3f {
  return exp(-underWater.extinction.rgb * distance);
}

// ∫ exp(−a·z(t) − σ·t) dt over t from 0 to `reach`, where
// z(t) = depth − rise·t stays at or above zero. Written from the integrand at
// both ends, whose exponents then stay at or below zero, so looking up
// through deep water cannot overflow. Where a·rise nearly cancels σ the
// difference over k loses its precision, so the series takes over.
fn waterSegment(a: vec3f, depth: f32, rise: f32, reach: f32) -> vec3f {
  let sigma = underWater.extinction.rgb;
  let k = sigma - a * rise;
  let start = exp(-a * depth);
  let end = exp(-a * max(depth - rise * reach, 0.0) - sigma * reach);
  let x = k * reach;
  return select((start - end) / k, start * reach * (1.0 - 0.5 * x), abs(x) < vec3f(1e-3));
}

// Light the water scatters toward the eye along world direction `dir`, from a
// point `depth` metres under the surface and `bedBelow` metres over the bed,
// out to `distance` metres. `sky` is the sky's irradiance on the surface. A
// rising ray stops at the surface and a falling one at the bed, so the depth
// along it stays linear.
fn waterInScatter(dir: vec3f, depth: f32, bedBelow: f32, distance: f32, sky: vec3f) -> vec3f {
  let sigma = underWater.extinction.rgb;
  let rise = dir.y;
  var reach = distance;
  if (rise > 1e-4) {
    reach = min(reach, depth / rise);
  }
  if (rise < -1e-4) {
    reach = min(reach, bedBelow / -rise);
  }
  let diffuse = sigma * WATER_SKY_SLANT;
  var light = sky * waterSegment(diffuse, depth, rise, reach);

  let bedDepth = depth + bedBelow;
  var onBed = sky * exp(-diffuse * bedDepth);
  let mu = underWater.sun.a;
  if (mu > 0.0) {
    let phase = waterPhase(dot(dir, underWater.sunDirection.xyz));
    light += underWater.sun.rgb * phase * waterSegment(sigma / mu, depth, rise, reach);
    onBed += underWater.sun.rgb * mu * exp(-sigma * bedDepth / mu);
  }
  light += WATER_BED_ALBEDO * onBed * waterSegment(diffuse, bedBelow, -rise, reach);
  return underWater.inScatter.rgb * sigma * light / WATER_PI;
}
