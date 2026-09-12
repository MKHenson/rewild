// Depth-only shadow pass for scatter — shadow-depth.wgsl's job over the same
// persistent instance buffer scatter-instanced.wgsl draws from.
//
// The instance transform is duplicated here rather than shared because the two
// shaders reach it through different bind groups: the scene pass has a camera
// and a material to place first, this one has a light matrix and nothing else.
// Both read the identical ScatterInstance layout out of the identical buffer,
// so a caster stands exactly where its lit copy does.
//
// The fragment stage exists for one reason: a leaf card is a cutout, and a
// card that casts its whole quad shadows the ground with a blocky silhouette
// nothing in the scene has.
//
// The cutout is stochastic rather than a cutoff. A far cascade's texel is a
// metre across, so a card samples its leaf texture several mips down where a
// cluster is one flat average; a cutoff there keeps a card whole or drops it
// whole, and the canopy's shadow thins with distance. Keeping each texel with
// the probability its alpha states holds the texture's coverage at every mip,
// and the shadow filter turns the noise into the density it stands for. An
// opaque primitive binds a test of 0 and keeps everything.

struct Uniforms {
  // lightVP * the chunk's world matrix, so instance positions stay in the
  // chunk-local space they were generated in.
  shadowMVP : mat4x4f,
  // The primitive's transform within its model, applied before the instance.
  nodeMatrix : mat4x4f,
  // xyz = viewer in chunk-local space. w unused.
  viewer : vec4f,
  // x = metres at which this LOD tier takes over, y = metres at which it hands
  // over, z = 1 for a cutout material, 0 for one that casts whole.
  range : vec4f,
}

struct ScatterInstance {
  posScale : vec4f,
  rotation : vec4f,
  params : vec4f,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read> instances : array<ScatterInstance>;
@group(0) @binding(2) var baseSampler : sampler;
@group(0) @binding(3) var baseColorMap : texture_2d<f32>;

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) uv : vec2f,
  // Chunk-local position, hashed for the cutout so its pattern sits on the
  // caster rather than on a shadow texel grid that moves with the camera.
  @location(1) local : vec3f,
}

// What a card keeps in the shadow map is its alpha scaled by this. Well above
// 1 on purpose: a leaf card is four fifths gap, and a canopy shadowed at that
// coverage is a light dapple where the impostor of the same tree casts its
// crown whole. Three brings a crown to near solid in a few overlapping cards.
const SHADOW_OPACITY = 3.0;

fn hash3(p : vec3f) -> f32 {
  return fract(sin(dot(p, vec3f(12.9898, 78.233, 37.719))) * 43758.5453);
}

const CULLED_POSITION = vec4f(0.0, 0.0, 2.0, 1.0);

fn rotateByQuat(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

@vertex
fn vs(
  @location(0) position : vec3f,
  @location(1) uv : vec2f,
  @builtin(instance_index) instanceIndex : u32
) -> VertexOutput {
  var output : VertexOutput;
  output.uv = uv;
  let instance = instances[instanceIndex];

  let nodePosition = (uniforms.nodeMatrix * vec4f(position, 1.0)).xyz;
  let chunkPosition =
    instance.posScale.xyz +
    rotateByQuat(instance.rotation, nodePosition * instance.posScale.w);

  // The same viewer-distance band the scene pass applies, so the caster set and
  // the drawn set are one set, tier for tier. Skipping it would shadow the
  // ground from trees that are not there, and draw a whole 480m chunk three
  // times over for the handful of instances actually in range.
  let viewDistance = distance(instance.posScale.xyz, uniforms.viewer.xyz);
  if (viewDistance < uniforms.range.x || viewDistance >= uniforms.range.y) {
    output.Position = CULLED_POSITION;
    return output;
  }

  output.Position = uniforms.shadowMVP * vec4f(chunkPosition, 1.0);
  output.local = chunkPosition;
  return output;
}

@fragment
fn fs(@location(0) uv : vec2f, @location(1) local : vec3f) {
  let alpha = textureSample(baseColorMap, baseSampler, uv).a;
  // Quantised to 5cm so the pattern is fixed to the leaf, not to the pixel.
  let noise = hash3(floor(local * 20.0));
  if (uniforms.range.z > 0.5 && alpha * SHADOW_OPACITY < noise) {
    discard;
  }
}
