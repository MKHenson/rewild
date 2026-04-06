struct PerSpriteUniforms {
  projMatrix: mat4x4f,
  viewPosition: vec3f,
  rotationAngle: f32,
  scale: vec2f,
  selected: f32,
  _pad: f32,
}
@group(0) @binding(0) var<uniform> perSprite: PerSpriteUniforms;

struct SpriteShared {
  diffuseColor: vec4f,
  selectionTint: vec4f,
}
@group(1) @binding(0) var<uniform> spriteShared: SpriteShared;
@group(1) @binding(1) var spriteSampler: sampler;
@group(1) @binding(2) var spriteTexture: texture_2d<f32>;

struct VertexInput {
  @location(0) position: vec4f,
  @location(1) uv: vec2f,
}

struct VertexOutput {
  @builtin(position) Position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Apply rotation offset to the quad vertex
  let cos_a = cos(perSprite.rotationAngle);
  let sin_a = sin(perSprite.rotationAngle);
  let rotated = vec2f(
    input.position.x * cos_a - input.position.y * sin_a,
    input.position.x * sin_a + input.position.y * cos_a
  );

  // Scale the billboard quad
  let scaled = rotated * perSprite.scale;

  // Billboard: offset from view-space center position
  let viewPos = vec4f(
    perSprite.viewPosition.x + scaled.x,
    perSprite.viewPosition.y + scaled.y,
    perSprite.viewPosition.z,
    1.0
  );

  output.Position = perSprite.projMatrix * viewPos;
  output.uv = input.uv;

  return output;
}

@fragment
fn fs(
  @location(0) uv: vec2f,
) -> @location(0) vec4f {
  let texColor = textureSample(spriteTexture, spriteSampler, uv);
  var color = texColor * spriteShared.diffuseColor;

  // Apply selection tint when selected
  if (perSprite.selected > 0.5) {
    color = vec4f(
      mix(color.rgb, spriteShared.selectionTint.rgb, spriteShared.selectionTint.a),
      color.a
    );
  }

  return color;
}
