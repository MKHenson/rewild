// Transfers the HDR scene colour target to the swapchain.
//
// The scene pass renders into an rgba16float target so shaded values above 1.0
// survive to the end of the frame instead of being clipped at write time. The
// swapchain is an 8-bit unorm format, so writing through this pass clamps to
// [0, 1] — exactly what the old direct-to-swapchain scene pass did implicitly.
// The image is therefore unchanged by the move to HDR.
//
// This pass is where whole-frame ACES tonemapping and exposure will live once
// they move out of the sky composite; until then it is a straight copy.

struct VSOut {
  @builtin(position) position: vec4f,
};

@vertex fn vs(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  // One oversized triangle covering the viewport — no vertex buffer, no uniforms.
  let pos = array(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );

  var out: VSOut;
  out.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  return out;
}

@group(0) @binding(0) var sceneTexture: texture_2d<f32>;

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  // The HDR target and the swapchain are always the same size, so this is an
  // exact 1:1 texel fetch — no sampler, and no filtering to introduce error.
  return textureLoad(sceneTexture, vec2i(in.position.xy), 0);
}
