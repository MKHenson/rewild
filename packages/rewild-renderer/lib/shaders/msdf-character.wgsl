// Positions for simple quad geometry
const pos = array(vec2f(0, -1), vec2f(1, -1), vec2f(0, 0), vec2f(1, 0));

struct VertexInput {
  @builtin(vertex_index) vertex : u32,
  @builtin(instance_index) instance : u32,
};

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) texcoord : vec2f,
};

struct Char {
  texOffset: vec2f,
  texExtent: vec2f,
  size: vec2f,
  offset: vec2f,
};

struct Characters {
  chars: array<vec3f>,
};

struct TextProperties {
  position: vec2f,
  scale: f32,
  padding0: f32,
  color: vec4f
};

struct Viewport {
  size: vec2f,
};

// Font bindings
@group(0) @binding(0) var fontTexture: texture_2d<f32>;
@group(0) @binding(1) var fontSampler: sampler;
@group(0) @binding(2) var<storage> chars: array<Char>;

// Text bindings
@group(1) @binding(0) var<uniform> viewport: Viewport;
@group(1) @binding(1) var<storage> text: Characters;
@group(1) @binding(2) var<uniform> textProperties: TextProperties;

@vertex
fn vs(input : VertexInput) -> VertexOutput {
  let textElement = text.chars[input.instance];
  let char = chars[u32(textElement.z)];
  let charPos = (pos[input.vertex] * char.size + textElement.xy + char.offset) * textProperties.scale;
  
  var output : VertexOutput;
  let posXYInPixels = textProperties.position;
  let position = vec2f(charPos.x, -charPos.y) + posXYInPixels;
 
  // convert the position from pixels to a 0.0 to 1.0 value
  let zeroToOne = position / viewport.size.xy;
 
  // convert from 0 <-> 1 to 0 <-> 2
  let zeroToTwo = zeroToOne * 2.0;
 
  // covert from 0 <-> 2 to -1 <-> +1 (clip space)
  let flippedClipSpace = zeroToTwo - 1.0;
 
  // flip Y
  let clipSpace = flippedClipSpace * vec2f(1, -1);
  
  output.position = vec4f(clipSpace, 0.0, 1.0); 
  output.texcoord = pos[input.vertex] * vec2f(1.0, -1.0);
  output.texcoord *= char.texExtent;
  output.texcoord += char.texOffset;
  return output;
}

fn sampleMsdf(texcoord: vec2f) -> f32 {
  let c = textureSample(fontTexture, fontSampler, texcoord);
  return max(min(c.r, c.g), min(max(c.r, c.g), c.b));
}

// Antialiasing technique from Paul Houx 
// https://github.com/Chlumsky/msdfgen/issues/22#issuecomment-234958005
@fragment
fn fs(input : VertexOutput) -> @location(0) vec4f {
  // pxRange (AKA distanceRange) comes from the msdfgen tool. Don McCurdy's tool
  // uses the default which is 4.
  let pxRange = 4.0;
  let sz = vec2f(textureDimensions(fontTexture, 0));
  let dx = sz.x*length(vec2f(dpdxFine(input.texcoord.x), dpdyFine(input.texcoord.x)));
  let dy = sz.y*length(vec2f(dpdxFine(input.texcoord.y), dpdyFine(input.texcoord.y)));
  let toPixels = pxRange * inverseSqrt(dx * dx + dy * dy);
  let sigDist = sampleMsdf(input.texcoord) - 0.5;
  let pxDist = sigDist * toPixels;

  let edgeWidth = 0.5;

  let alpha = smoothstep(-edgeWidth, edgeWidth, pxDist);

  if (alpha < 0.001) {
    discard;
  }

  return vec4f(textProperties.color.rgb, textProperties.color.a * alpha);
}