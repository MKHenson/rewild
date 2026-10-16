// Portal lightning (PortalSparks): each bolt segment is a ribbon facing the
// camera, at least MIN_HALF_WIDTH_PIXELS wide, added onto the composited
// frame. A white-hot core fades into a glow in the portal's tint across it.

// Brightness after exposure of the core and of the glow at full strength.
const CORE: f32 = 6.0;
const GLOW: f32 = 1.2;
// The narrowest a ribbon is drawn each side of its centre, in pixels, so a
// bolt far off or on a small portal still shows.
const MIN_HALF_WIDTH_PIXELS: f32 = 2.5;

struct SparkUniforms {
  viewProjection : mat4x4f,
  cameraPosition : vec3f,
  exposure : f32,
  // World size of one pixel per metre from the camera.
  pixelSize : f32,
}

struct VertexInput {
  @location(0) posA : vec3f,
  @location(1) posB : vec3f,
  // 0 at the segment's A end, 1 at its B end.
  @location(2) isB : f32,
  // -1 or 1: which edge of the ribbon.
  @location(3) side : f32,
  @location(4) brightness : f32,
  @location(5) halfWidth : f32,
  @location(6) tint : vec3f,
}

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) across : f32,
  @location(1) brightness : f32,
  @location(2) tint : vec3f,
}

@group(0) @binding(0) var<uniform> spark : SparkUniforms;

@vertex
fn vs(input : VertexInput) -> VertexOutput {
  var output : VertexOutput;
  let pos = mix(input.posA, input.posB, input.isB);
  let along = normalize(input.posB - input.posA);
  let toCamera = spark.cameraPosition - pos;
  let perpendicular = normalize(cross(along, normalize(toCamera)));
  let minHalfWidth = MIN_HALF_WIDTH_PIXELS * spark.pixelSize * length(toCamera);
  let halfWidth = max(input.halfWidth, minHalfWidth);
  let world = pos + perpendicular * halfWidth * input.side;
  output.position = spark.viewProjection * vec4f(world, 1.0);
  output.across = input.side;
  output.brightness = input.brightness;
  output.tint = input.tint;
  return output;
}

@fragment
fn fs(input : VertexOutput) -> @location(0) vec4f {
  let d = abs(input.across);
  let core = exp(-d * d * 8.0);
  let glow = exp(-d * 2.5);
  let colour = mix(input.tint * GLOW * glow, vec3f(CORE), core);
  return vec4f(colour * input.brightness / spark.exposure, 0.0);
}
