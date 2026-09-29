// Sea spray draw (SeaSpray). Each live particle is a camera-facing puff that
// rides the wave it rose from, lifts off it and falls back, drifts downwind,
// grows and dissolves. It draws after the atmosphere composite, so it fogs
// itself with the scene's fog (fog.wgsl, composed ahead of this file), and
// fades out where the scene is close behind it instead of cutting into it.
// PI comes from skyConstants.wgsl, composed ahead of it too.

#include "./sky/atmosphere-uniforms.wgsl"
#include "./shader-lib/sea-spray-common.wgsl"
#include "./shader-lib/water-waves.wgsl"

// Metres of scene behind a puff over which it fades in, so it meets the water
// softly.
const SOFT_DEPTH : f32 = 1.5;
// Metres from the camera over which a puff fades in, so none fills the view.
const NEAR_FADE : f32 = 4.0;
// Share of the reach over which spray fades out at its edge.
const FAR_FADE : f32 = 0.2;
// Spray is fine droplets: bright, and much brighter looking toward the sun,
// which it scatters forward.
const ALBEDO : f32 = 0.85;
const FORWARD_SCATTER : f32 = 3.0;
// Most a puff turns off level either way, in radians. The texture is a
// flattened cloud, so it stays roughly level.
const MAX_TILT : f32 = 0.35;
// A plume off rock is this much taller than wide, and rises faster than a
// puff: its lift follows t^IMPACT_RISE rather than t^0.6.
const IMPACT_TALL : f32 = 1.8;
const IMPACT_WIDE : f32 = 0.8;
const IMPACT_RISE : f32 = 0.4;
// Surf is thrown up whole and settles: it shrinks to SURF_END of its size by
// the end of its life.
const SURF_END : f32 = 0.35;

@group(0) @binding(0) var<uniform> params : SprayParams;
@group(0) @binding(1) var<storage, read> particles : array<SprayParticle>;
@group(0) @binding(2) var<uniform> waves : Waves;
@group(0) @binding(3) var oceanDisplacement : texture_2d_array<f32>;
@group(0) @binding(4) var oceanSampler : sampler;
@group(0) @binding(5) var sprayTexture : texture_2d<f32>;
@group(0) @binding(6) var spraySampler : sampler;
@group(0) @binding(7) var sceneDepth : texture_depth_2d;
@group(0) @binding(8) var irradiance : texture_cube<f32>;
@group(0) @binding(9) var irradianceSampler : sampler;
@group(0) @binding(10) var<uniform> object : FinalUniformStruct;

// fog.wgsl reads the sun's elevation from here.
var<private> sunDotUp : f32;

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  // From the camera to the puff, in world space.
  @location(1) relative : vec3f,
  // x: 0..1 of its life. y: its random value. z: how hard its crest broke. w:
  // its opacity.
  @location(2) life : vec4f,
}

// The waves' displacement at rest position `rest`, over the cascades the ocean
// takes, from a mip smooth enough for a puff metres wide.
fn displacementAt(rest : vec2f) -> vec3f {
  var d = vec3f(0.0);
  for (var c : i32 = 0; c < CASCADES; c++) {
    let w = waves.cascadeTypes[c].x;
    if (w <= 0.0) {
      continue;
    }
    d += textureSampleLevel(oceanDisplacement, oceanSampler, cascadeUV(c, rest), c, 2.0).xyz * w;
  }
  return d;
}

@vertex
fn vs(@builtin(vertex_index) vertex : u32, @builtin(instance_index) instance : u32) -> VertexOutput {
  var out : VertexOutput;
  let particle = particles[instance];
  let age = params.camera.w - particle.rise.z;
  let t = age / max(particle.rise.w, 1e-3);
  if (particle.rise.w <= 0.0 || t < 0.0 || t >= 1.0) {
    // Behind the far plane, so the rasteriser drops it.
    out.position = vec4f(0.0, 0.0, 2.0, 1.0);
    return out;
  }

  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0)
  );
  let corner = corners[vertex];
  let random = particle.shape.y;
  let strength = mix(0.4, 1.0, particle.shape.x);
  let kind = particle.shape.z;
  let impact = kind == SPRAY_IMPACT;

  // x metres across, y metres it rises, w opacity.
  var look = vec4f(params.shape.y, params.shape.z, 0.0, params.reach.z);
  if (kind == SPRAY_SURF) {
    look = params.surf;
  } else if (impact) {
    look = params.impact;
  }

  // An open-sea puff rides the crest it rose from; shore spray rises from the
  // level. Each lifts off fast and falls back slower, drifts downwind, and
  // surf is carried on toward the shore.
  let rest = particle.rise.xy - waves.origin.xy;
  var wave = vec3f(0.0);
  if (kind == SPRAY_OPEN) {
    wave = displacementAt(rest);
  }
  let lift = look.y * strength * sin(PI * pow(t, select(0.6, IMPACT_RISE, impact)));
  let drift = params.wind.xy * (params.reach.w * params.wind.z * age) + particle.motion.xy * age;
  let centre = vec3f(
    particle.rise.x + wave.x + drift.x,
    params.wind.w + wave.y + lift,
    particle.rise.y + wave.z + drift.y
  );

  // A puff or plume grows as it spreads; surf shrinks as it settles. Each is
  // turned a little and mirrored by its random value, and a plume stands
  // tall.
  var growth = 0.45 + 0.55 * sqrt(t);
  if (kind == SPRAY_SURF) {
    growth = mix(1.0, SURF_END, t);
  }
  let half = 0.5 * look.x * strength * growth;
  let tilt = (random * 2.0 - 1.0) * MAX_TILT * select(1.0, 0.3, impact);
  let stretch = select(vec2f(1.0), vec2f(IMPACT_WIDE, IMPACT_TALL), impact);
  let turned = vec2f(
    corner.x * cos(tilt) - corner.y * sin(tilt),
    corner.x * sin(tilt) + corner.y * cos(tilt)
  ) * stretch;
  let relative = centre - params.camera.xyz
    + (params.right.xyz * turned.x + params.up.xyz * turned.y) * half;

  out.position = params.viewProj * vec4f(relative, 1.0);
  let flip = select(1.0, -1.0, fract(random * 7.0) > 0.5);
  out.uv = vec2f(corner.x * flip, -corner.y) * 0.5 + 0.5;
  out.relative = relative;
  out.life = vec4f(t, random, particle.shape.x, look.w);
  return out;
}

fn hash2(p : vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn noise2(p : vec2f) -> f32 {
  let i = floor(p);
  var f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), f.x),
    mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), f.x),
    f.y
  );
}

@fragment
fn fs(input : VertexOutput) -> @location(0) vec4f {
  let texel = textureSample(sprayTexture, spraySampler, input.uv);
  let t = input.life.x;
  let random = input.life.y;

  // In quickly, out slowly, and dissolving from its thin edges as it ages.
  let fade = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.45, 1.0, t));
  let grain = noise2(input.uv * 6.0 + vec2f(random * 91.0, t * 1.5));
  let dissolve = smoothstep(t * 0.8 - 0.1, t * 0.8 + 0.25, grain * texel.a);
  var alpha = texel.a * fade * dissolve * input.life.w;

  // Soft against the scene behind, and faded at both ends of its reach.
  let distance = length(input.relative);
  let size = vec2f(textureDimensions(sceneDepth));
  let pixel = vec2i(input.position.xy);
  let depth = textureLoad(sceneDepth, pixel, 0);
  let ndc = vec2f(input.position.x / size.x * 2.0 - 1.0, 1.0 - input.position.y / size.y * 2.0);
  let behind = params.invViewProj * vec4f(ndc, depth, 1.0);
  let sceneDistance = select(1e9, length(behind.xyz / behind.w), depth < 1.0);
  alpha *= saturate((sceneDistance - distance) / SOFT_DEPTH);
  alpha *= smoothstep(1.0, NEAR_FADE, distance);
  alpha *= 1.0 - smoothstep(params.reach.x * (1.0 - FAR_FADE), params.reach.x, distance);
  if (alpha <= 0.002) {
    discard;
  }

  // Lit by the sun, scattered forward toward the viewer, and by the sky.
  let view = input.relative / max(distance, 1e-3);
  let toSun = normalize(object.sunPosition);
  let forward = 1.0 + FORWARD_SCATTER * pow(saturate(dot(view, toSun)), 8.0);
  let sun = params.sun.rgb * (0.5 / PI) * forward;
  let sky = textureSampleLevel(irradiance, irradianceSampler, vec3f(0.0, 1.0, 0.0), 0.0).rgb;
  var color = ALBEDO * texel.rgb * (sun + sky);

  // The scene's fog, as the atmosphere composite applies it.
  sunDotUp = toSun.y;
  let fog = 1.0 - sceneFogTransmittance(object.cameraPosition, view, distance);
  color = mix(color, getFogScatterColor(view, toSun), fog);

  // Premultiplied.
  return vec4f(color * alpha, alpha);
}
