struct ShadowUniforms {
  shadowMVP: mat4x4f,
}

@group(0) @binding(0) var<uniform> shadowUniforms: ShadowUniforms;

@vertex
fn vs(@location(0) position: vec3f) -> @builtin(position) vec4f {
  return shadowUniforms.shadowMVP * vec4f(position, 1.0);
}
