struct OurVertexShaderOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

// Doesnt change much 
struct OurStruct {
  color: vec4f,
  offset: vec2f,
};

// Does change much
struct OtherStruct {
  scale: vec2f,
};

@group(0) @binding(0) var<uniform> ourStruct: OurStruct;
@group(0) @binding(1) var<uniform> otherStruct: OtherStruct;

@vertex
fn vs(
  @builtin(vertex_index) vertexIndex : u32
) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(
    vec2f(0.0, 0.5),
    vec2f(-0.5, -0.5),
    vec2f(0.5, -0.5)
  );

  return vec4f(
    pos[vertexIndex] * otherStruct.scale + ourStruct.offset, 0.0, 1.0);
}
  
@fragment
fn fs() -> @location(0) vec4f {
  return ourStruct.color;
}