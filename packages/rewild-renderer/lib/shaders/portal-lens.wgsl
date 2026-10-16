// Bends the composited frame around each portal on screen (PortalLens). Each
// pixel's view ray is placed against the sphere the way portal.wgsl places it:
// r is the ray's closest approach to the centre over the radius, so r = 1 is
// the sphere's exact edge. A pixel in the ring out to REACH shows the scene
// from nearer the edge, so what lies behind is stretched around the sphere,
// and is turned about its centre as if dragged by the spin. The portal's edge
// glow fades out across the ring. Pixels nearer the camera than the portal
// are left alone.

const REACH: f32 = 2.6;
// Where the ring's inner edge samples: just clear of the sphere.
const EDGE_CLEARANCE: f32 = 1.01;
// How much nearer the edge the inner part of the ring samples: 0 all at the
// edge, 1 none.
const PULL: f32 = 0.3;
const TWIST: f32 = 0.9;
const SPLIT: f32 = 0.05;
const BRIGHTEN: f32 = 0.3;
// The glow's falloff outwards from the edge, in r.
const EDGE_GLOW_OUTER: f32 = 0.12;
const MAX_PORTALS: u32 = 4u;

struct LensParams {
  projection : mat4x4f,
  inverseProjection : mat4x4f,
  // xy: the frame's size in pixels. z: how many portals are set. w: exposure.
  frame : vec4f,
  // xyz: a portal's centre in view space. w: its radius.
  portals : array<vec4f, MAX_PORTALS>,
  // rgb: a portal's tint times its glow.
  glows : array<vec4f, MAX_PORTALS>,
}

@group(0) @binding(0) var<uniform> lens : LensParams;
@group(0) @binding(1) var frame : texture_2d<f32>;
@group(0) @binding(2) var frameSampler : sampler;
@group(0) @binding(3) var sceneDepth : texture_depth_2d;

fn toNdc(pixel : vec2f) -> vec2f {
  let size = lens.frame.xy;
  return vec2f(pixel.x / size.x * 2.0 - 1.0, 1.0 - pixel.y / size.y * 2.0);
}

fn viewDepth(pixel : vec2f) -> f32 {
  let depth = textureLoad(sceneDepth, vec2i(pixel), 0);
  let view = lens.inverseProjection * vec4f(toNdc(pixel), depth, 1.0);
  return -view.z / view.w;
}

fn rotateAbout(v : vec3f, axis : vec3f, angle : f32) -> vec3f {
  let c = cos(angle);
  let s = sin(angle);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

fn toUv(viewDir : vec3f) -> vec2f {
  let clip = lens.projection * vec4f(viewDir, 1.0);
  let ndc = clip.xy / clip.w;
  return vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
}

@fragment
fn fs(@builtin(position) position : vec4f) -> @location(0) vec4f {
  let pixel = position.xy;
  let base = textureLoad(frame, vec2i(pixel), 0);
  let count = min(u32(lens.frame.z), MAX_PORTALS);
  let unprojected = lens.inverseProjection * vec4f(toNdc(pixel), 0.5, 1.0);
  let rayDir = normalize(unprojected.xyz / unprojected.w);

  for (var i = 0u; i < count; i++) {
    let centre = lens.portals[i].xyz;
    let radius = lens.portals[i].w;
    let distance = length(centre);
    if (distance <= radius * 1.05) {
      continue;
    }

    let axis = centre / distance;
    let cosAngle = dot(rayDir, axis);
    let sinEdge = radius / distance;
    let reach = min(REACH, 0.99 / sinEdge);
    let sinAngle = sqrt(max(1.0 - cosAngle * cosAngle, 0.0));
    let r = sinAngle / sinEdge;
    if (cosAngle <= 0.0 || r <= 1.0 || r >= reach) {
      continue;
    }
    if (viewDepth(pixel) < -centre.z - radius) {
      continue;
    }

    let t = (r - 1.0) / (reach - 1.0);
    let falloff = (1.0 - t) * (1.0 - t);
    let outward = (rayDir - axis * cosAngle) / sinAngle;

    var colour = vec3f(0.0);
    for (var channel = 0; channel < 3; channel++) {
      let k = 1.0 + SPLIT * falloff * f32(channel - 1);
      let pulled = mix(r, EDGE_CLEARANCE + (r - 1.0) * PULL, min(falloff * k, 1.0));
      let sinSample = min(pulled * sinEdge, 0.999);
      let side = rotateAbout(outward, axis, TWIST * falloff * k);
      let sampleDir = axis * sqrt(1.0 - sinSample * sinSample) + side * sinSample;
      colour[channel] = textureSampleLevel(frame, frameSampler, toUv(sampleDir), 0.0)[channel];
    }
    colour *= 1.0 + BRIGHTEN * falloff * falloff;
    colour += lens.glows[i].rgb * exp(-(r - 1.0) / EDGE_GLOW_OUTER) / lens.frame.w;
    return vec4f(colour, base.a);
  }

  return base;
}
