#include "iblCommon.wgsl"

// Draws the IBL chain as rows of cube faces along the bottom of the screen,
// plus the BRDF map. Debug only — enabled by showIblCubes().
//
//   row 0 (bottom): captured sky
//   row 1:          diffuse irradiance
//   row 2:          prefiltered specular at the selected roughness mip
//   right of row 2: the BRDF integration map
//
// Reading it: row 1 should be a smooth gradient with no visible structure at
// all, and row 2 at mip 0 should be *identical* to row 0 — it is a straight
// copy of the capture — then blur monotonically as the mip is raised.
//
// The BRDF map reads red over most of its area with green concentrated in the
// top-left. Note it is vertically flipped against the familiar GL-oriented
// picture of this map: fragCoord.y counts down, so roughness 0 is the top row
// here rather than the bottom. That is self-consistent — a sample at
// vec2f(nDotV, 0) lands on the row written at roughness 0 — but it is worth
// knowing before comparing against a reference image.

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) face: u32,
  @location(2) @interpolate(flat) row: u32,
};

struct DebugUniforms {
  // Camera.exposure times the viewer's own bias. Without the camera's value
  // these tiles are unreadable: at exposure 0.06 blue sky is ~7 HDR, clouds ~40
  // and the sun corona ~290, so tonemapping them unexposed puts that entire 40x
  // range into the top few percent of the display and everything reads white.
  exposure: f32,
  /** Which mip of the specular cube row 2 displays. */
  specularMip: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var capturedCube: texture_cube<f32>;
@group(0) @binding(1) var cubeSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: DebugUniforms;
@group(0) @binding(3) var irradianceCube: texture_cube<f32>;
@group(0) @binding(4) var specularCube: texture_cube<f32>;
@group(0) @binding(5) var brdfLut: texture_2d<f32>;

// Strip geometry in NDC. Tiles are square in NDC rather than in pixels, so on a
// wide canvas each face reads horizontally stretched — this is a readout, not a
// preview, and an aspect uniform would be one more thing to keep in sync.
const TILE_SIZE: f32 = 0.2;
const STRIP_LEFT: f32 = -0.96;
const STRIP_BOTTOM: f32 = -0.96;

/** 6 faces x 3 rows, then one more quad for the BRDF map. */
const ROW_COUNT: u32 = 3u;
const TILES_PER_ROW: u32 = 6u;
const BRDF_ROW: u32 = 3u;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var quad = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );

  let tile = vi / 6u;
  let corner = quad[vi % 6u];

  // Tiles 0..17 are the three cube rows; the last tile is the BRDF map, parked
  // one column past the end of the top row. Where it *sits* and what it *is*
  // are tracked separately — it shares the top row's position but not its
  // content, and the fragment shader keys off the latter.
  let isCubeTile = tile < ROW_COUNT * TILES_PER_ROW;

  var screenRow = ROW_COUNT - 1u;
  var column = TILES_PER_ROW;
  var content = BRDF_ROW;
  if (isCubeTile) {
    screenRow = tile / TILES_PER_ROW;
    column = tile % TILES_PER_ROW;
    content = screenRow;
  }

  var out: VertexOutput;
  out.pos = vec4f(
    STRIP_LEFT + (f32(column) + corner.x) * TILE_SIZE,
    STRIP_BOTTOM + (f32(screenRow) + corner.y) * TILE_SIZE,
    0.0,
    1.0
  );
  // Flip v so the tile is oriented the way the face was rendered: fragCoord
  // counts down the face while this quad's corner.y counts up the screen.
  out.uv = vec2f(corner.x, 1.0 - corner.y);
  out.face = column;
  out.row = content;
  return out;
}

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

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  // The BRDF map is not radiance — it is a pair of dimensionless factors in
  // 0..1 — so it bypasses exposure and the tone curve entirely and is shown raw.
  if (in.row == BRDF_ROW) {
    let rg = textureSampleLevel(brdfLut, cubeSampler, in.uv, 0.0).rg;
    return vec4f(rg.r, rg.g, 0.0, 1.0);
  }

  // Sampling back through the same convention the capture was written with
  // means a face landing in the wrong layer, or mirrored inside it, shows up
  // here rather than silently in the lighting.
  let dir = cubeDirection(in.face, in.uv);

  var hdr = vec3f(0.0);
  if (in.row == 0u) {
    hdr = textureSampleLevel(capturedCube, cubeSampler, dir, 0.0).rgb;
  } else if (in.row == 1u) {
    hdr = textureSampleLevel(irradianceCube, cubeSampler, dir, 0.0).rgb;
  } else {
    hdr = textureSampleLevel(
      specularCube, cubeSampler, dir, uniforms.specularMip
    ).rgb;
  }

  // This draws onto the swapchain after the frame tonemap has already run, so
  // it has to do its own — and it does exactly what that pass does: exposure,
  // then one ACES curve, then straight out. No gamma encode, because the
  // swapchain is plain bgra8unorm and tonemap.wgsl does not encode either.
  // Matching it is the whole point: a tile should read like the sky above it,
  // so a value that looks wrong here is wrong in the capture rather than in
  // the viewer.
  return vec4f(tonemapACES(uniforms.exposure * hdr), 1.0);
}
