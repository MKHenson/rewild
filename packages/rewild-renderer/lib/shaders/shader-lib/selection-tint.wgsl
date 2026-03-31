// Selection tint: blends a yellow highlight onto the fragment color.
// Expects `uniforms.selected` (f32, 0.0 or 1.0) to be in scope.
// Include as a header, then call applySelectionTint(color) in your fragment shader.

fn applySelectionTint(color: vec4f, amount: f32) -> vec4f {
  let selectionColor = vec3f(1.0, 0.9, 0.1);
  return vec4f(mix(color.rgb, selectionColor, uniforms.selected * amount), color.a);
}
