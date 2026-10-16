// A sphere that shows another place through it. The disc is a wide-angle view
// of a cube of the destination, upright like a window: the centre looks
// straight through, and the view swings out to VIEW_ANGLE at the horizon and
// bends harder past it. The view darkens towards the edge, where a glow in the
// portal's tint peaks and a band of light swirls. The glow carries on outside
// the sphere in portal-lens.wgsl, which must match EDGE_GLOW_* below.

#include "./shader-lib/scene-output.wgsl"
#include "./shader-lib/selection-tint.wgsl"

struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4f,
  selected: f32,
}

struct PortalParams {
  viewToWorld: mat4x4f,
  tint: vec3f,
  glow: f32,
  time: f32,
  exposure: f32,
  // 1 when the cube holds a tonemapped bake, 0 when it holds HDR radiance.
  baked: f32,
  lensing: f32,
}

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) viewPosition : vec3f,
  @location(1) @interpolate(flat) centre : vec3f,
  @location(2) @interpolate(flat) radius : f32,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(0) var<uniform> portal : PortalParams;
@group(1) @binding(1) var viewSampler : sampler;
@group(1) @binding(2) var viewCube : texture_cube<f32>;

const TAU = 6.283185307;
// Radians off the line of sight the view reaches at the disc's edge, before
// HORIZON_BEND is added towards it.
const VIEW_ANGLE = 1.15;
const HORIZON_BEND = 0.9;
const HORIZON_START = 0.72;
const HORIZON_END = 0.97;
const HORIZON_DARK = 0.95;
// Radii of the glow's falloff from the edge, inwards here and outwards in the lens.
const EDGE_GLOW_INNER = 0.05;
const SWIRL_CELLS = 16.0;
// The sphere is a unit mesh scaled to the portal's radius. Its facets dip
// inside a true sphere, so the vertices are pushed out by this much and the
// fragment shader cuts the exact circle.
const MESH_PADDING = 1.04;
// A rough water surface over the view: a few Gerstner waves across the disc,
// in disc radii. Their slope bends the view by WATER_REFRACTION, and glints
// where the surface faces WATER_LIGHT add up to WATER_SHINE. It eases off
// from WATER_FADE_START so the horizon stays still.
const WATER_REFRACTION = 0.05;
const WATER_CHOP = 0.6;
const WATER_SHINE = 0.05;
const WATER_FADE_START = 0.75;
const WATER_LIGHT = vec3f(-0.35, 0.55, 0.76);

@vertex
fn vs(@location(0) position : vec3f) -> VertexOutput {
  var output : VertexOutput;
  let mvPosition = uniforms.modelViewMatrix * vec4f(position * MESH_PADDING, 1.0);
  output.position = uniforms.projMatrix * mvPosition;
  output.viewPosition = mvPosition.xyz;
  output.centre = uniforms.modelViewMatrix[3].xyz;
  output.radius = length(uniforms.modelViewMatrix[0].xyz);
  return output;
}

fn hash(p : vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

// Value noise that repeats every `period` cells in x, so it can run around a
// circle without a seam.
fn periodicNoise(p : vec2f, period : f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let x0 = i.x - period * floor(i.x / period);
  let x1 = x0 + 1.0 - period * floor((x0 + 1.0) / period);
  return mix(
    mix(hash(vec2f(x0, i.y)), hash(vec2f(x1, i.y)), u.x),
    mix(hash(vec2f(x0, i.y + 1.0)), hash(vec2f(x1, i.y + 1.0)), u.x),
    u.y
  );
}

fn periodicFbm(p : vec2f, period : f32) -> f32 {
  var sum = 0.0;
  var amplitude = 0.5;
  var q = p;
  var cells = period;
  for (var i = 0; i < 4; i++) {
    sum += amplitude * periodicNoise(q, cells);
    q *= 2.0;
    cells *= 2.0;
    amplitude *= 0.5;
  }
  return sum;
}

// One Gerstner wave's horizontal push of the surface at `p`.
fn waveShift(p : vec2f, dir : vec2f, wavelength : f32, amplitude : f32, speed : f32) -> vec2f {
  let k = TAU / wavelength;
  return dir * (WATER_CHOP * amplitude * cos(k * dot(dir, p) - speed * k * portal.time));
}

// One Gerstner wave's slope at `p`.
fn waveSlope(p : vec2f, dir : vec2f, wavelength : f32, amplitude : f32, speed : f32) -> vec2f {
  let k = TAU / wavelength;
  return dir * (amplitude * k * cos(k * dot(dir, p) - speed * k * portal.time));
}

// Slope of the water at `p` in the disc: the waves are summed at the point
// their crests have been pushed to, which sharpens crests and widens troughs.
fn waterSlope(p : vec2f) -> vec2f {
  let shifted = p
    - waveShift(p, vec2f(0.8, 0.6), 0.9, 0.035, 0.12)
    - waveShift(p, vec2f(-0.6, 0.8), 0.55, 0.025, 0.1)
    - waveShift(p, vec2f(0.98, -0.2), 0.35, 0.015, 0.08)
    - waveShift(p, vec2f(-0.3, -0.95), 0.22, 0.01, 0.06)
    - waveShift(p, vec2f(0.5, -0.87), 0.14, 0.006, 0.05);
  return waveSlope(shifted, vec2f(0.8, 0.6), 0.9, 0.035, 0.12)
    + waveSlope(shifted, vec2f(-0.6, 0.8), 0.55, 0.025, 0.1)
    + waveSlope(shifted, vec2f(0.98, -0.2), 0.35, 0.015, 0.08)
    + waveSlope(shifted, vec2f(-0.3, -0.95), 0.22, 0.01, 0.06)
    + waveSlope(shifted, vec2f(0.5, -0.87), 0.14, 0.006, 0.05);
}

// Inverse of tonemapACES in tonemap.wgsl, so a bake of the final image comes
// back as the radiance that produced it.
fn inverseACES(y : vec3f) -> vec3f {
  let v = min(y, vec3f(0.98));
  let a = v * 2.43 - 2.51;
  let b = v * 0.59 - 0.03;
  let c = v * 0.14;
  return (-b - sqrt(b * b - 4.0 * a * c)) / (2.0 * a);
}

fn sampleView(viewDir : vec3f) -> vec3f {
  let worldDir = (portal.viewToWorld * vec4f(viewDir, 0.0)).xyz;
  let texel = textureSample(viewCube, viewSampler, worldDir).rgb;
  if (portal.baked > 0.5) {
    return inverseACES(texel) / portal.exposure;
  }
  return texel;
}

@fragment
fn fs(in : VertexOutput) -> SceneFragment {
  let rayDir = normalize(in.viewPosition);
  let axis = normalize(in.centre);
  let offset = rayDir * dot(in.centre, rayDir) - in.centre;
  let b = length(offset);
  let edge = b / in.radius;
  let r = min(edge, 1.0);

  let water = 1.0 - smoothstep(WATER_FADE_START, HORIZON_END, r);
  let slope = waterSlope(offset.xy / in.radius) * water;
  let bent = offset / in.radius + vec3f(slope * WATER_REFRACTION, 0.0);
  let bentR = min(length(bent), 1.0);
  let outward = bent / max(length(bent), 1e-5);

  let theta = portal.lensing * (VIEW_ANGLE * bentR + HORIZON_BEND * pow(bentR, 6.0));
  let split = 0.03 * pow(r, 4.0);

  var seen = vec3f(0.0);
  for (var channel = 0; channel < 3; channel++) {
    let angle = theta * (1.0 + split * f32(channel - 1));
    seen[channel] = sampleView(axis * cos(angle) + outward * sin(angle))[channel];
  }
  let normal = normalize(vec3f(-slope, 1.0));
  let glint = pow(max(dot(reflect(-WATER_LIGHT, normal), vec3f(0.0, 0.0, 1.0)), 0.0), 40.0);
  seen *= 1.0 + WATER_SHINE * glint * water;
  seen *= 1.0 - HORIZON_DARK * smoothstep(HORIZON_START, HORIZON_END, r);

  let turn = atan2(offset.y, offset.x) / TAU + 0.5;
  let spiral = vec2f(
    turn * SWIRL_CELLS + portal.time * 0.6 - r * 12.0,
    r * 8.0 + portal.time * 0.2
  );
  let band = smoothstep(0.8, 0.95, r) * (1.0 - smoothstep(0.97, 1.0, r));
  let swirl = band * pow(periodicFbm(spiral, SWIRL_CELLS), 3.0);

  let glow = exp((r - 1.0) / EDGE_GLOW_INNER);
  let flicker = 0.85 + 0.15 * periodicNoise(vec2f(turn * 32.0, portal.time * 6.0), 32.0);

  let emitted = portal.tint * portal.glow * (swirl * flicker * 0.8 + glow) / portal.exposure;

  if (edge > 1.0) {
    discard;
  }
  return sceneFragment(applySelectionTint(vec4f(seen + emitted, 1.0), 0.35));
}
