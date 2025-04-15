struct VertexShaderOutput {
  @builtin(position) position: vec4f, 
};

@vertex fn vs( @builtin(vertex_index) vertexIndex : u32 ) -> VertexShaderOutput {
  let pos = array(
    // 1st triangle
    vec2f(-1.0, -1.0),  // bottom-left
    vec2f( 1.0, -1.0),  // bottom-right
    vec2f(-1.0,  1.0),  // top-left

    // 2nd triangle
    vec2f(-1.0,  1.0),  // top-left
    vec2f( 1.0, -1.0),  // bottom-right
    vec2f( 1.0,  1.0),  // top-right
  );

  var vsOutput: VertexShaderOutput;
  let xy = pos[vertexIndex];
  vsOutput.position = vec4f(xy, 0.0, 1.0);
  return vsOutput;
}