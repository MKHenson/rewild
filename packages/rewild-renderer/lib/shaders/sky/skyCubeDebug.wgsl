// Draws the six faces of the captured sky cubemap as a strip along the bottom
// of the screen. Debug only — enabled by showIblCubes().

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) face: u32,
};

// Strip geometry in NDC. Tiles are square in NDC rather than in pixels, so on a
// wide canvas each face reads horizontally stretched — this is a readout, not a
// preview, and an aspect uniform would be one more thing to keep in sync.
const TILE_SIZE: f32 = 0.28;
const STRIP_LEFT: f32 = -0.92;
const STRIP_BOTTOM: f32 = -0.96;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var quad = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );

  let face = vi / 6u;
  let corner = quad[vi % 6u];

  var out: VertexOutput;
  out.pos = vec4f(
    STRIP_LEFT + (f32(face) + corner.x) * TILE_SIZE,
    STRIP_BOTTOM + corner.y * TILE_SIZE,
    0.0,
    1.0
  );
  // Flip v so the tile is oriented the way the face was rendered: fragCoord
  // counts down the face while this quad's corner.y counts up the screen.
  out.uv = vec2f(corner.x, 1.0 - corner.y);
  out.face = face;
  return out;
}

@group(0) @binding(0) var skyCube: texture_cube<f32>;
@group(0) @binding(1) var cubeSampler: sampler;

struct DebugUniforms {
  // Camera.exposure times the viewer's own bias. Without the camera's value
  // these tiles are unreadable: at exposure 0.06 blue sky is ~7 HDR, clouds ~40
  // and the sun corona ~290, so tonemapping them unexposed puts that entire 40x
  // range into the top few percent of the display and everything reads white.
  exposure: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(2) var<uniform> uniforms: DebugUniforms;

// The same fit as tonemap.wgsl, deliberately duplicated rather than included —
// that file declares the frame compositor's own bindings and entry points.
// https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
fn tonemapACES(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

// Mirrors getCubeDirection() in starfield.wgsl, which is also the convention
// SkyCubeCapture's face matrices are built from. Sampling the cube back through
// it means a face drawn into the wrong layer, or mirrored inside its layer,
// shows up here rather than silently in the IBL.
fn getCubeDirection(faceIndex: u32, uv: vec2f) -> vec3f {
  let u = 2.0 * uv.x - 1.0;
  let v = 2.0 * uv.y - 1.0;
  switch (faceIndex) {
    case 0u: { return normalize(vec3f( 1.0, -v, -u)); } // +X
    case 1u: { return normalize(vec3f(-1.0, -v,  u)); } // -X
    case 2u: { return normalize(vec3f( u,  1.0,  v)); } // +Y
    case 3u: { return normalize(vec3f( u, -1.0, -v)); } // -Y
    case 4u: { return normalize(vec3f( u, -v,  1.0)); } // +Z
    default: { return normalize(vec3f(-u, -v, -1.0)); } // -Z
  }
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let dir = getCubeDirection(in.face, in.uv);
  let hdr = textureSampleLevel(skyCube, cubeSampler, dir, 0.0).rgb;

  // This draws onto the swapchain after the frame tonemap has already run, so
  // it has to do its own — and it does exactly what that pass does: exposure,
  // then one ACES curve, then straight out. No gamma encode, because the
  // swapchain is plain bgra8unorm and tonemap.wgsl does not encode either.
  // Matching it is the whole point: a tile should read like the sky above it,
  // so a value that looks wrong here is wrong in the capture rather than in
  // the viewer.
  return vec4f(tonemapACES(uniforms.exposure * hdr), 1.0);
}
