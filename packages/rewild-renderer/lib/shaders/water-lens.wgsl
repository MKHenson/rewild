// Water on the lens (WaterLens), drawn over the composited frame before the
// tonemap. `fs_lens` blurs each pixel by whether its lens is wet, and bends
// the view across the waterline where the surface crosses the lens. `vs_drop`
// and `fs_drop` draw the drops on the lens (LensDrops), left on surfacing or
// landed in rain. Both read a copy of the frame with mips (`frame`). The
// drops' shape and shading follow Tidewater's lens droplets (MIT).

#include "./shader-lib/under-water.wgsl"

// The waterline: samples within MENISCUS_PIXELS of it bend away from it, by up
// to MENISCUS_BEND pixels, as through a rounded edge of water. A dark contact
// line CONTACT_PIXELS wide sits on it, and a bright rim follows on the water
// side, RIM_GAIN brighter at its peak.
const MENISCUS_PIXELS: f32 = 16.0;
const MENISCUS_BEND: f32 = 6.0;
const CONTACT_PIXELS: f32 = 1.5;
const CONTACT_DARK: f32 = 0.65;
const RIM_START: f32 = 2.0;
const RIM_END: f32 = 9.0;
const RIM_GAIN: f32 = 0.6;
// The blur takes the centre and lensParams.quality.x taps on a ring around
// it, each at the mip that matches the radius.
// A drop's outline wobbles by two sine lobes around it, 3 and 5 to a turn,
// DROP_LOBE_3 and DROP_LOBE_5 of its radius, at phases from its seed. A
// sliding drop stretches along its fall by up to 1 / DROP_SLIDE_SQUASH.
const DROP_LOBE_3: f32 = 0.12;
const DROP_LOBE_5: f32 = 0.06;
const DROP_SLIDE_SQUASH: f32 = 0.8;
// The quad around a drop, over its radius: room for the lobes and the stretch.
const DROP_EXTENT: f32 = 1.5;
// A drop is a strong fisheye lens: the scene inside it is inverted, moved by
// up to DROP_FISHEYE of the frame's height along its surface, and blurred. It
// darkens toward its edge to DROP_EDGE and catches a highlight DROP_HIGHLIGHT
// as bright as what it shows. A trail is DROP_TRAIL_WIDTH of the drop's
// radius wide, blurred and darkened to DROP_TRAIL_DARK.
const DROP_FISHEYE: f32 = 0.05;
const DROP_EDGE: f32 = 0.7;
const DROP_HIGHLIGHT: f32 = 0.35;
const DROP_TRAIL_WIDTH: f32 = 0.45;
const DROP_TRAIL_DARK: f32 = 0.9;

struct LensParams {
  // The camera's inverse view-projection, for each pixel's view direction.
  invViewProjection : mat4x4f,
  // xy: the frame's size in pixels. z: the blur's radius in pixels where the
  // lens is in water, w where it is in air.
  frame : vec4f,
  // x: the wind's blur radius in pixels at the screen's corners. y: 0..1 of
  // the way out from the centre it starts.
  wind : vec4f,
  // From the quality tier (WaterQuality): x taps on the blur's ring, y 1 to
  // blur drops' trails, 0 for one sample.
  quality : vec4f,
}

// A drop on the lens, in uv with y down: xy its centre, z its radius over the
// frame's height, w its opacity; then the length of the trail above it over
// the frame's height, the trail's opacity, a random value for its shape, and
// 0..1 how fast it slides.
struct Drop {
  body : vec4f,
  trail : vec4f,
}

@group(0) @binding(0) var<uniform> lensParams : LensParams;
@group(0) @binding(1) var<uniform> underWater : UnderWater;
@group(0) @binding(2) var frame : texture_2d<f32>;
@group(0) @binding(3) var frameSampler : sampler;
@group(0) @binding(4) var<storage, read> drops : array<Drop>;

fn viewDirection(uv: vec2f) -> vec3f {
  let clip = vec4f(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0, 1.0, 1.0);
  let world = lensParams.invViewProjection * clip;
  return normalize(world.xyz / world.w - underWater.viewToWorld[3].xyz);
}

// The frame around `uv` blurred over `radius` pixels.
fn blurred(uv: vec2f, radius: f32) -> vec3f {
  if (radius < 0.5) {
    return textureSampleLevel(frame, frameSampler, uv, 0.0).rgb;
  }
  let texel = 1.0 / lensParams.frame.xy;
  let lod = max(log2(radius) - 1.0, 0.0);
  let taps = i32(lensParams.quality.x);
  var sum = textureSampleLevel(frame, frameSampler, uv, lod).rgb;
  for (var i = 0; i < taps; i++) {
    let angle = f32(i) * 6.2831853 / f32(taps) + 0.4;
    let offset = vec2f(cos(angle), sin(angle)) * radius * 0.6 * texel;
    sum += textureSampleLevel(frame, frameSampler, uv + offset, lod).rgb;
  }
  return sum / f32(taps + 1);
}

@fragment
fn fs_lens(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let uv = fragCoord.xy / lensParams.frame.xy;
  let depth = lensWaterDepth(viewDirection(uv));
  // The waterline is where the depth crosses zero; over its screen gradient,
  // the depth gives the signed pixels to it, positive on the water side.
  let gradient = vec2f(dpdx(depth), dpdy(depth));
  let pixels = depth / max(length(gradient), 1e-7);
  let watching = underWater.camera.x > 0.5;
  let wet = watching && depth > 0.0;
  let meniscus = select(0.0, 1.0 - saturate(abs(pixels) / MENISCUS_PIXELS), watching);

  let across = select(vec2f(0.0), normalize(gradient), length(gradient) > 0.0);
  let bend = across * sign(pixels) * meniscus * meniscus * MENISCUS_BEND / lensParams.frame.xy;
  // In air, high wind blurs the view toward the screen's edges.
  let size = lensParams.frame.xy;
  let aspect = vec2f(size.x / size.y, 1.0);
  let fromCentre = length((uv - 0.5) * aspect) / length(aspect * 0.5);
  let windy = smoothstep(lensParams.wind.y, 1.0, fromCentre);
  let air = max(lensParams.frame.w, lensParams.wind.x * windy * windy);
  let radius = select(air, lensParams.frame.z, wet);
  var colour = blurred(uv + bend, radius);

  let contact = (1.0 - smoothstep(0.0, CONTACT_PIXELS, abs(pixels))) * select(0.0, 1.0, watching);
  let rim = smoothstep(RIM_START * 0.5, RIM_START, pixels) * (1.0 - smoothstep(RIM_START, RIM_END, pixels));
  colour *= (1.0 - CONTACT_DARK * contact) * (1.0 + RIM_GAIN * rim * select(0.0, 1.0, watching));
  return vec4f(colour, 1.0);
}

struct DropOutput {
  @builtin(position) position : vec4f,
  // Pixels from the drop's centre, y down.
  @location(0) local : vec2f,
  @location(1) @interpolate(flat) index : u32,
}

// Two quads a drop: one over its body, and one only as wide as its trail
// over the trail above it, so a long trail does not shade a body-wide strip
// up the screen. They do not overlap.
@vertex
fn vs_drop(@builtin(vertex_index) vertexId : u32, @builtin(instance_index) index : u32) -> DropOutput {
  let drop = drops[index];
  let size = lensParams.frame.xy;
  let radius = drop.body.z * size.y;
  let trail = drop.trail.x * size.y;
  let reach = radius * DROP_EXTENT;
  // Two triangles: (0,0) (1,0) (0,1) and (0,1) (1,0) (1,1).
  let corner = vertexId % 6u;
  let at = vec2f(f32((0x32u >> corner) & 1u), f32((0x2Cu >> corner) & 1u));
  var low = vec2f(-reach);
  var high = vec2f(reach);
  if (vertexId >= 6u) {
    let width = radius * DROP_TRAIL_WIDTH;
    low = vec2f(-width, min(-trail, -reach));
    high = vec2f(width, -reach);
  }
  let local = mix(low, high, at);
  let pixel = drop.body.xy * size + local;
  var out: DropOutput;
  out.position = vec4f(pixel.x / size.x * 2.0 - 1.0, 1.0 - pixel.y / size.y * 2.0, 0.0, 1.0);
  out.local = local;
  out.index = index;
  return out;
}

@fragment
fn fs_drop(input: DropOutput) -> @location(0) vec4f {
  let drop = drops[input.index];
  let size = lensParams.frame.xy;
  let radius = max(drop.body.z * size.y, 1.0);
  let uv = drop.body.xy + input.local / size;
  let seed = drop.trail.z;

  var body = vec4f(0.0);
  // The trail's own quad lies above the body's: no outline to draw there.
  if (input.local.y >= -radius * DROP_EXTENT) {
    // The outline: a few lobes, stretched along the fall while it slides.
    let d = input.local * vec2f(1.0, mix(1.0, DROP_SLIDE_SQUASH, drop.trail.w));
    let angle = atan2(d.y, d.x);
    let wobble = 1.0 + sin(angle * 3.0 + seed * 40.0) * DROP_LOBE_3 + sin(angle * 5.0 + seed * 97.0) * DROP_LOBE_5;
    let q = d / (radius * wobble);
    let r2 = dot(q, q);
    if (r2 < 1.0) {
      let nz = sqrt(1.0 - r2);
      let offset = q * -DROP_FISHEYE * (1.0 - nz * 0.5);
      let inside = blurred(uv + vec2f(offset.x * size.y / size.x, offset.y), radius * 0.25);
      let edge = smoothstep(0.45, 1.0, r2);
      let highlight = (1.0 - smoothstep(0.0, 0.3, length(q - vec2f(-0.3, -0.4)))) * DROP_HIGHLIGHT;
      let colour = inside * mix(1.04, DROP_EDGE, edge) + inside * highlight;
      body = vec4f(colour, drop.body.w * (1.0 - smoothstep(0.7, 1.0, r2)));
    }
  }

  var trail = vec4f(0.0);
  let width = radius * DROP_TRAIL_WIDTH;
  let trailLength = drop.trail.x * size.y;
  let across = abs(input.local.x) / width;
  if (across < 1.0 && input.local.y < 0.0 && trailLength > 0.0) {
    let along = saturate(1.0 + input.local.y / trailLength);
    var colour = textureSampleLevel(frame, frameSampler, uv, 0.0).rgb;
    if (lensParams.quality.y > 0.5) {
      colour = blurred(uv, 3.0);
    }
    colour *= DROP_TRAIL_DARK;
    trail = vec4f(colour, drop.trail.y * (1.0 - across * across) * along);
  }
  return select(trail, body, body.a >= trail.a);
}
