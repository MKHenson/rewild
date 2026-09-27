// Copies the opaque scene for water to refract: rgb the HDR colour, a the view
// depth in metres. One load then gives both what lies behind the water and
// whether it lies behind at all.

struct CaptureParams {
  inverseProjection : mat4x4f,
}

@group(0) @binding(0) var sceneColor : texture_2d<f32>;
@group(0) @binding(1) var sceneDepth : texture_depth_2d;
@group(0) @binding(2) var<uniform> capture : CaptureParams;

// One triangle that covers the screen.
@vertex
fn vs(@builtin(vertex_index) index : u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) position : vec4f) -> @location(0) vec4f {
  let texel = vec2i(position.xy);
  let colour = textureLoad(sceneColor, texel, 0);
  let depth = textureLoad(sceneDepth, texel, 0);
  let size = vec2f(textureDimensions(sceneDepth));
  let ndc = vec2f(position.x / size.x * 2.0 - 1.0, 1.0 - position.y / size.y * 2.0);
  let view = capture.inverseProjection * vec4f(ndc, depth, 1.0);
  return vec4f(colour.rgb, -view.z / view.w);
}
