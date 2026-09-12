// Bakes one view of a scatter model into an octahedral impostor atlas.
//
// Runs once per layer at load, one draw per (view, primitive) into a tile of
// the atlas. Two targets: base colour and the model-space normal, both stored
// premultiplied by coverage so the mip chain averages a leaf against nothing
// rather than against black. The impostor pass divides the alpha back out.
//
// Unlit on purpose. The atlas is a view of the surface, not of a lighting
// condition — the normal target is what lets the far tier take the sun, the
// sky and the shadow map at draw time like the mesh tiers do.

struct BakeUniforms {
  // Orthographic clip transform for this view, model space in.
  viewProj : mat4x4f,
  // The primitive's place within its model.
  nodeMatrix : mat4x4f,
  baseColorFactor : vec4f,
  // x = alpha cutoff, y = 1 for an alpha-masked primitive, z = 1 to keep the
  // normal as authored rather than turning it toward the view, w = occlusion
  // strength.
  params : vec4f,
  // The direction this view looks from, model space.
  viewDir : vec4f,
}

@group(0) @binding(0) var<uniform> bake : BakeUniforms;
@group(0) @binding(1) var baseSampler : sampler;
@group(0) @binding(2) var baseColorMap : texture_2d<f32>;
@group(0) @binding(3) var occlusionMap : texture_2d<f32>;

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) uv : vec2f,
  @location(1) normal : vec3f,
}

struct FragmentOutput {
  @location(0) albedo : vec4f,
  @location(1) normal : vec4f,
}

@vertex
fn vs(
  @location(0) position : vec3f,
  @location(1) uv : vec2f,
  @location(2) normal : vec3f
) -> VertexOutput {
  var output : VertexOutput;
  let node3 = mat3x3f(
    bake.nodeMatrix[0].xyz,
    bake.nodeMatrix[1].xyz,
    bake.nodeMatrix[2].xyz
  );
  output.Position = bake.viewProj * bake.nodeMatrix * vec4f(position, 1.0);
  output.uv = uv;
  output.normal = normalize(node3 * normal);
  return output;
}

// The mip the base colour is read at. A tile is small next to the leaf
// texture, so a card lands several mips down, where alpha has averaged
// against the gutters; coverage is scaled back up with the level so the test
// keeps what the card covers rather than what one texel happens to hold.
fn baseColorMipLevel(uv : vec2f) -> f32 {
  let texels = uv * vec2f(textureDimensions(baseColorMap));
  let dx = dpdx(texels);
  let dy = dpdy(texels);
  return max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
}

@fragment
fn fs(input : VertexOutput) -> FragmentOutput {
  let sample = textureSample(baseColorMap, baseSampler, input.uv) * bake.baseColorFactor;
  let coverage = sample.a * (1.0 + 0.5 * baseColorMipLevel(input.uv));
  if (bake.params.y > 0.5 && coverage < bake.params.x) {
    discard;
  }

  // A card seen from behind is lit by the mirror of its normal, as the mesh
  // passes do — unless the normal is authored for the crown rather than the
  // card, in which case it already faces out.
  var n = normalize(input.normal);
  if (bake.params.z < 0.5 && dot(n, bake.viewDir.xyz) < 0.0) {
    n = -n;
  }

  // Occlusion folded into the colour. The mesh tiers apply it to indirect
  // light only; at the range a billboard draws, the difference is invisible
  // and the crown's depth is not.
  let occlusionSample = textureSample(occlusionMap, baseSampler, input.uv).r;
  let occlusion = 1.0 + bake.params.w * (occlusionSample - 1.0);

  var output : FragmentOutput;
  output.albedo = vec4f(sample.rgb * occlusion, 1.0);
  output.normal = vec4f(n * 0.5 + 0.5, 1.0);
  return output;
}
