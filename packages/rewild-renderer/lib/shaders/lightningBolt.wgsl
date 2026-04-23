// ── Uniforms ──────────────────────────────────────────────────────────────────
// Byte layout (96 bytes, aligned to 256):
//  [0 ..15] viewProjMatrix   mat4x4<f32>  (64 bytes)
//  [16..18] cameraPosition   vec3<f32>    (12 bytes)
//  [19]     halfWidth        f32          ( 4 bytes)
//  [20]     intensity        f32          ( 4 bytes)
//  [21]     branchScale      f32          ( 4 bytes)  branch opacity multiplier
//  [22..23] _pad             vec2<f32>    ( 8 bytes)
struct BoltUniforms {
  viewProjMatrix: mat4x4<f32>,
  cameraPosition: vec3<f32>,
  halfWidth:      f32,
  intensity:      f32,
  branchScale:    f32,
  _pad:           vec2<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: BoltUniforms;

// ── Vertex input ──────────────────────────────────────────────────────────────
// Each vertex belongs to one segment and carries both endpoints so the
// billboard perpendicular can be computed consistently for all 6 verts.
//  arrayStride 32 bytes:
//   offset  0: posA  (float32x3, 12 bytes)
//   offset 12: posB  (float32x3, 12 bytes)
//   offset 24: isB   (float32,    4 bytes)  0 = A-end, 1 = B-end
//   offset 28: side  (float32,    4 bytes)  -1 or +1
struct VertexInput {
  @location(0) posA: vec3<f32>,
  @location(1) posB: vec3<f32>,
  @location(2) isB:  f32,
  @location(3) side: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0)       perpDist: f32,   // -1..+1 across the ribbon width
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;

  // World position of this vertex (either A-end or B-end of the segment)
  let pos    = mix(input.posA, input.posB, input.isB);
  let segDir = normalize(input.posB - input.posA);
  let toCam  = normalize(uniforms.cameraPosition - pos);

  // Perpendicular to both segment direction and view ray — consistent for
  // all vertices sharing the same posA/posB because segDir is identical.
  let perp = normalize(cross(segDir, toCam));

  let worldPos = pos + perp * (uniforms.halfWidth * input.side);
  out.position = uniforms.viewProjMatrix * vec4<f32>(worldPos, 1.0);
  out.perpDist = input.side;

  return out;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4<f32> {
  let d = abs(input.perpDist); // 0 at centreline, 1 at ribbon edge

  // Soft outer glow + bright inner core
  let glow = exp(-d *  4.0) * uniforms.intensity;
  let core = exp(-d * 20.0) * uniforms.intensity;
  let brightness = glow + core;

  // White-blue tint: slightly warmer toward the edge
  let tint  = vec3<f32>(0.88 + 0.12 * (1.0 - d), 0.92 + 0.08 * (1.0 - d), 1.0);
  return vec4<f32>(tint * brightness, brightness);
}
