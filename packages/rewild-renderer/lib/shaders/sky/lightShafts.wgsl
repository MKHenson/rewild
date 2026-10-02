// Light shafts under water (LightShafts). `fs_march` runs at half resolution:
// it marches the view ray SHAFT_STEPS steps out to SHAFT_REACH metres,
// sampling the caustics at each step's depth, and sums what the focused sun
// adds to the water's glow there, or takes from it, dimmed along the sun's
// path and the view's. The fog already scatters the calm sun, so the shafts
// are the difference. Alpha keeps the ray's distance. `fs_composite` adds them
// to the full frame in the atmosphere composite's pass, weighting the four
// nearest half-resolution texels by how near their distance is to the pixel's,
// so shafts do not bleed across edges.

#include "../shader-lib/under-water.wgsl"
#include "../shader-lib/water-fog.wgsl"
#include "../shader-lib/caustics.wgsl"
#include "./atmosphere-uniforms.wgsl"

const SHAFT_REACH: f32 = 22.0;
const SHAFT_STEPS: i32 = 20;
// Metres a pixel that hits nothing is taken to reach.
const ENDLESS: f32 = 1e4;
// Share of a pixel's distance within which a half-resolution texel counts
// as the same surface.
const EDGE_SHARE: f32 = 0.1;

struct ShaftParams {
  // x: the frame, for the jitter. y: strength; 1 is the physical answer.
  frame : vec4f,
}

@group(0) @binding(0) var<uniform> object : FinalUniformStruct;
@group(0) @binding(1) var depthTexture : texture_depth_2d;
@group(0) @binding(2) var<uniform> underWater : UnderWater;
@group(0) @binding(3) var causticsMap : texture_2d<f32>;
@group(0) @binding(4) var causticsSampler : sampler;
@group(0) @binding(5) var<uniform> caustics : CausticsParams;
@group(0) @binding(6) var<uniform> shafts : ShaftParams;
@group(0) @binding(7) var shaftMap : texture_2d<f32>;

struct Ray {
  dir : vec3f,
  distance : f32,
}

// The view ray through full-resolution `pixel`, to the first thing it hits.
fn viewRay(pixel: vec2i) -> Ray {
  let size = vec2i(textureDimensions(depthTexture));
  let texel = clamp(pixel, vec2i(0), size - 1);
  let uv = (vec2f(texel) + 0.5) / vec2f(size);
  let rawDepth = textureLoad(depthTexture, texel, 0);
  let clip = vec4f(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0, rawDepth, 1.0);
  let world = object.invViewProjectionMatrix * clip;
  let offset = world.xyz / world.w - object.cameraPosition;
  var ray: Ray;
  ray.dir = normalize(offset);
  ray.distance = select(length(offset), ENDLESS, rawDepth >= 1.0);
  return ray;
}

// Interleaved-gradient noise, turned each frame.
fn shaftNoise(pixel: vec2f, frame: f32) -> f32 {
  let p = pixel + 5.588238 * (frame % 64.0);
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

@fragment
fn fs_march(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let ray = viewRay(vec2i(fragCoord.xy * 2.0));
  let mu = underWater.sun.a;
  if (!lensInWater(ray.dir) || mu <= 0.0) {
    return vec4f(0.0, 0.0, 0.0, ray.distance);
  }
  let sigma = underWater.extinction.rgb;
  let below = cameraWaterDepth();
  let rise = ray.dir.y;
  var reach = min(ray.distance, SHAFT_REACH);
  if (rise > 1e-4) {
    reach = min(reach, below / rise);
  }
  let stride = reach / f32(SHAFT_STEPS);
  let jitter = shaftNoise(fragCoord.xy, shafts.frame.x);
  var sum = vec3f(0.0);
  for (var i: i32 = 0; i < SHAFT_STEPS; i++) {
    let t = (f32(i) + jitter) * stride;
    let depth = below - rise * t;
    if (depth <= 0.0) {
      continue;
    }
    let focus = causticLight(causticsPlace(ray.dir.xz * t), depth, 0.0, caustics.water.x);
    sum += exp(-sigma * (depth / mu + t)) * (focus - 1.0);
  }
  let phase = waterPhase(dot(ray.dir, underWater.sunDirection.xyz));
  let scatter = underWater.inScatter.rgb * sigma / WATER_PI;
  let light = scatter * underWater.sun.rgb * phase * sum * stride * shafts.frame.y;
  return vec4f(light, ray.distance);
}

@fragment
fn fs_composite(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let ray = viewRay(vec2i(fragCoord.xy));
  if (!lensInWater(ray.dir)) {
    discard;
  }
  let coarse = fragCoord.xy * 0.5 - 0.5;
  let base = vec2i(floor(coarse));
  let f = coarse - floor(coarse);
  let last = vec2i(textureDimensions(shaftMap)) - 1;
  let tolerance = max(ray.distance * EDGE_SHARE, 0.05);
  var sum = vec3f(0.0);
  var total = 0.0;
  for (var j: i32 = 0; j < 2; j++) {
    for (var i: i32 = 0; i < 2; i++) {
      let s = textureLoad(shaftMap, clamp(base + vec2i(i, j), vec2i(0), last), 0);
      let bilinear = select(1.0 - f.x, f.x, i == 1) * select(1.0 - f.y, f.y, j == 1);
      let w = bilinear * (exp(-abs(s.a - ray.distance) / tolerance) + 1e-3);
      sum += s.rgb * w;
      total += w;
    }
  }
  return vec4f(sum / max(total, 1e-6), 1.0);
}
