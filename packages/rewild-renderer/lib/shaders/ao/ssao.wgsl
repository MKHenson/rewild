// Screen-space ambient occlusion at half resolution: a cosine-weighted
// hemisphere around the depth-reconstructed normal, each tap tested against
// the depth buffer. The tap pattern rotates over a 4x4 tile, which
// ssao-blur.wgsl averages back out.

#include "./ao-common.wgsl"
#include "./ao-depth.wgsl"

const AO_SAMPLES: i32 = ${ AO_SAMPLES };
const GOLDEN_ANGLE: f32 = 2.39996323;
const TAU: f32 = 6.28318531;

@group(0) @binding(0) var sceneDepth: texture_depth_2d;
@group(0) @binding(1) var<uniform> ao: AoParams;

fn bayer2(cell: vec2u) -> u32 {
  return ((cell.x ^ cell.y) << 1u) | cell.y;
}

// 0..15, every value once per 4x4 tile, neighbours far apart.
fn bayer4(cell: vec2u) -> u32 {
  return bayer2(cell & vec2u(1u)) * 4u + bayer2((cell >> vec2u(1u)) & vec2u(1u));
}

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let halfTexel = vec2i(position.xy);
  let size = vec2i(textureDimensions(sceneDepth));
  let texel = min(halfTexel * 2, size - 1);

  if (aoLoadDepth(texel, size) >= 1.0) {
    return vec4f(1.0, AO_SKY_DEPTH, 0.0, 0.0);
  }

  let P = aoViewPosition(texel, size);
  let viewDepth = -P.z;
  let fade = 1.0 - smoothstep(ao.fadeStart, ao.fadeEnd, viewDepth);
  if (fade <= 0.0) {
    return vec4f(1.0, viewDepth, 0.0, 0.0);
  }

  // Per axis, the neighbour that continues this surface rather than one across
  // a silhouette.
  let left = aoViewPosition(texel - vec2i(1, 0), size);
  let right = aoViewPosition(texel + vec2i(1, 0), size);
  let up = aoViewPosition(texel - vec2i(0, 1), size);
  let down = aoViewPosition(texel + vec2i(0, 1), size);
  let dx = select(P - left, right - P, abs(right.z - P.z) < abs(P.z - left.z));
  let dy = select(P - up, down - P, abs(down.z - P.z) < abs(P.z - up.z));
  var N = normalize(cross(dy, dx));
  if (dot(N, -P) < 0.0) {
    N = -N;
  }

  let helper = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(N.x) > 0.9);
  let T = normalize(cross(helper, N));
  let B = cross(N, T);

  let cell = vec2u(halfTexel) & vec2u(3u);
  let rotation = f32(bayer4(cell)) / 16.0 * TAU;
  let jitter = f32(bayer4(cell.yx)) / 16.0;

  // Depth precision falls with distance, so the surface's own noise does too.
  let bias = 0.02 + 0.002 * viewDepth;
  let origin = P + N * bias;
  let radius = ao.radius;

  var occlusion = 0.0;
  for (var i = 0; i < AO_SAMPLES; i++) {
    let u = (f32(i) + 0.5) / f32(AO_SAMPLES);
    let phi = f32(i) * GOLDEN_ANGLE + rotation;
    let sinTheta = sqrt(u);
    let dir = T * (sinTheta * cos(phi)) + B * (sinTheta * sin(phi)) + N * sqrt(1.0 - u);
    let reach = fract(f32(i) * 0.618034 + jitter);
    let S = origin + dir * (radius * mix(0.1, 1.0, reach * reach));

    let clip = ao.projection * vec4f(S, 1.0);
    let ndc = clip.xy / clip.w;
    let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    if (any(uv < vec2f(0.0)) || any(uv >= vec2f(1.0))) {
      continue;
    }

    let sceneZ = aoViewPosition(vec2i(uv * vec2f(size)), size).z;
    // A surface further than the radius from P is something else in front of
    // it, and fades out of the count rather than haloing it.
    let range = smoothstep(0.0, 1.0, radius / max(abs(P.z - sceneZ), 1e-4));
    occlusion += select(0.0, range, sceneZ > S.z + bias);
  }

  let visibility = pow(1.0 - occlusion / f32(AO_SAMPLES), ao.intensity);
  return vec4f(mix(1.0, visibility, fade), viewDepth, 0.0, 0.0);
}
