// The far scatter tier: one camera-facing billboard per instance, textured
// from the octahedral atlas ScatterImpostorBake.ts captured off the model.
//
// Same instance buffer and same per-draw uniform as scatter-instanced.wgsl,
// with the band test keeping the instances beyond the last mesh tier. The
// quad is framed in model space from the direction to the camera, so it
// rotates with the instance's yaw the way the model did, and the three atlas
// tiles nearest that direction are blended so walking round a tree crossfades
// between captures instead of snapping.
//
// Shading is the mesh tier's: the atlas holds base colour and the model-space
// normal, and the fragment builds a rough dielectric surface from them and
// runs it through the same BRDF, IBL and shadow taps.

#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/brdf.wgsl"
#include "./shader-lib/pbr-lighting.wgsl"
#include "./shader-lib/ibl.wgsl"
#include "./shader-lib/cloud-shadow.wgsl"
#include "./shader-lib/pcf.wgsl"
#include "./shader-lib/directional-shadow.wgsl"
#include "./shader-lib/spot-light-shadow.wgsl"
#include "./shader-lib/scatter-impostor.wgsl"
#include "./shader-lib/lod-fade.wgsl"

struct Uniforms {
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4f,
  // Unused here: the billboard has no place within a model. Kept so the
  // group's one uniform buffer serves both passes.
  nodeMatrix : mat4x4f,
  // The tier's distance band: fades in over [x, y] and out over [z, w].
  band : vec4f,
  // x = the tier index, y = 1 to tint by tier for the LOD debug view, z = the
  // reciprocal of the camera exposure, so the tint lands in scene units.
  debug : vec4f,
}

const TIER_TINTS = array<vec3f, 4>(
  vec3f(0.2, 1.0, 0.2),
  vec3f(1.0, 1.0, 0.2),
  vec3f(1.0, 0.5, 0.1),
  vec3f(1.0, 0.1, 0.1)
);

const CULLED_POSITION = vec4f(0.0, 0.0, 2.0, 1.0);

struct ScatterInstance {
  posScale : vec4f,
  rotation : vec4f,
  params : vec4f,
};

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) uv : vec2f,
  @location(1) viewPosition : vec3f,
  // The hemisphere direction the tiles are picked by, model space.
  @location(2) @interpolate(flat) octDir : vec3f,
  @location(3) @interpolate(flat) rotation : vec4f,
  @location(4) fade : vec2f,
  // The billboard's half-edge in metres, for the shadow receiver offset.
  @location(5) @interpolate(flat) reach : f32,
}

@group(0) @binding(0) var atlasSampler : sampler;
@group(0) @binding(1) var albedoAtlas : texture_2d<f32>;
@group(0) @binding(2) var normalAtlas : texture_2d<f32>;
@group(0) @binding(3) var<uniform> impostor : ImpostorParams;

@group(1) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(1) var<storage, read> instances : array<ScatterInstance>;

@group(2) @binding(0) var<storage, read> lighting : LightingUniforms;

@group(3) @binding(0) var cloudShadowMap: texture_2d<f32>;
@group(3) @binding(1) var cloudShadowSampler: sampler;
@group(3) @binding(2) var<uniform> cloudShadowParams: CloudShadowParams;
@group(3) @binding(3) var shadowAtlas: texture_depth_2d;
@group(3) @binding(4) var shadowSampler: sampler_comparison;
@group(3) @binding(5) var<uniform> directionalShadowParams: DirectionalShadowParams;
@group(3) @binding(6) var<uniform> spotLightShadowParams: SpotLightShadowParams;
@group(3) @binding(7) var iblIrradianceMap: texture_cube<f32>;
@group(3) @binding(8) var iblSpecularMap: texture_cube<f32>;
@group(3) @binding(9) var iblBrdfLut: texture_2d<f32>;
@group(3) @binding(10) var iblSampler: sampler;
@group(3) @binding(11) var<uniform> iblParams: IblParams;

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
  let instance = instances[instanceIndex];
  let scale = instance.posScale.w;
  let q = instance.rotation;

  // The billboard stands on the model's bounding sphere, not its origin, so
  // it covers the crown of a tree rather than the ground under it.
  let centre = instance.posScale.xyz + rotateByQuat(q, impostor.centre.xyz * scale);

  // The camera in chunk-local space: the model-view is rigid, so its inverse
  // is the transpose of the rotation applied to the negated translation.
  let mv3 = mat3x3f(
    uniforms.modelViewMatrix[0].xyz,
    uniforms.modelViewMatrix[1].xyz,
    uniforms.modelViewMatrix[2].xyz
  );
  let cameraLocal = -(transpose(mv3) * uniforms.modelViewMatrix[3].xyz);

  // Measured to the instance origin like every mesh tier, so the handover
  // between them is one distance and no instance draws twice or not at all.
  let viewDistance = distance(cameraLocal, instance.posScale.xyz);
  if (viewDistance < uniforms.band.x || viewDistance >= uniforms.band.w) {
    output.Position = CULLED_POSITION;
    return output;
  }
  output.fade = lodFadeWeights(viewDistance, uniforms.band);

  // Into model space, where the atlas was captured, then framed there and
  // turned back — so the quad follows the instance's yaw as the model would.
  let dirModel = rotateByQuat(quatConjugate(q), normalize(cameraLocal - centre));
  let octDir = impostorHemiDir(dirModel);
  let right = impostorRight(octDir);
  let up = impostorUp(octDir, right);
  let radius = impostor.centre.w * scale;
  let corner = (right * position.x + up * position.y) * radius;
  let chunkPosition = centre + rotateByQuat(q, corner);

  let mvPosition = uniforms.modelViewMatrix * vec4f(chunkPosition, 1.0);
  output.Position = uniforms.projMatrix * mvPosition;
  output.viewPosition = mvPosition.xyz;
  output.uv = uv;
  output.octDir = octDir;
  output.rotation = q;
  output.reach = radius;
  return output;
}

// The direction toward the sun in view space, or zero without one.
fn sunDirection() -> vec3f {
  for (var i : u32 = 0u; i < lighting.numLights; i++) {
    if (lighting.lights[i].lightType == 1.0) {
      return -lighting.lights[i].positionOrDirection;
    }
  }
  return vec3f(0.0);
}

// Both atlases are premultiplied by coverage, so a tile's colour and normal
// blend by weight and divide out at the end.
struct AtlasSample {
  albedo : vec4f,
  normal : vec4f,
}

fn sampleTile(tile : vec2f, uv : vec2f, weight : f32) -> AtlasSample {
  let atlasUv = (tile + uv) / impostor.atlas.x;
  var s : AtlasSample;
  s.albedo = textureSample(albedoAtlas, atlasSampler, atlasUv) * weight;
  s.normal = textureSample(normalAtlas, atlasSampler, atlasUv) * weight;
  return s;
}

// The mip the sampler will pick for a tile, from the atlas-space footprint of
// one screen pixel. Minified coverage thins under an alpha test as the mip
// chain averages leaf against gap, so alpha is scaled back up with the level.
fn tileMipLevel(uv : vec2f) -> f32 {
  let texels = uv * vec2f(textureDimensions(albedoAtlas)) / impostor.atlas.x;
  let dx = dpdx(texels);
  let dy = dpdy(texels);
  return max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
}

@fragment
fn fs(
  @location(0) uv : vec2f,
  @location(1) surfaceViewPosition : vec3f,
  @location(2) @interpolate(flat) octDir : vec3f,
  @location(3) @interpolate(flat) rotation : vec4f,
  @location(4) fade : vec2f,
  @location(5) @interpolate(flat) reach : f32,
  @builtin(position) fragCoord : vec4f
) -> @location(0) vec4f {
  if (!lodFadeKeeps(fragCoord.xy, fade)) {
    discard;
  }

  // Tile centres sit at the corners of a (views - 1)² grid over the octahedral
  // square. The three tiles of the triangle the direction lands in share the
  // blend by barycentric weight.
  let tiles = impostor.atlas.x;
  let grid = impostorOctUv(octDir) * (tiles - 1.0);
  let cell = min(floor(grid), vec2f(tiles - 2.0));
  let f = grid - cell;

  // Which of the cell's two triangles, chosen without a branch: a texture
  // sample has to sit in uniform control flow.
  let upper = f.x + f.y >= 1.0;
  let a = sampleTile(
    select(cell, cell + vec2f(1.0, 1.0), upper),
    uv,
    select(1.0 - f.x - f.y, f.x + f.y - 1.0, upper)
  );
  let b = sampleTile(cell + vec2f(1.0, 0.0), uv, select(f.x, 1.0 - f.y, upper));
  let c = sampleTile(cell + vec2f(0.0, 1.0), uv, select(f.y, 1.0 - f.x, upper));

  var s : AtlasSample;
  s.albedo = a.albedo + b.albedo + c.albedo;
  s.normal = a.normal + b.normal + c.normal;

  let coverage = s.albedo.a * (1.0 + 0.6 * tileMipLevel(uv));
  if (coverage < impostor.atlas.y) {
    discard;
  }

  let baseColor = s.albedo.rgb / max(s.albedo.a, 1e-4);
  let modelNormal = (s.normal.xyz / max(s.normal.a, 1e-4)) * 2.0 - 1.0;

  let mv3 = mat3x3f(
    uniforms.modelViewMatrix[0].xyz,
    uniforms.modelViewMatrix[1].xyz,
    uniforms.modelViewMatrix[2].xyz
  );
  let normal = normalize(mv3 * rotateByQuat(rotation, normalize(modelNormal)));

  // Shadows are received a diameter toward the sun from the texel. The
  // billboard faces the camera while its caster faces the sun, so half of it
  // lies behind its own caster in light space and would shadow itself along
  // the line where the two planes cross. Pushed clear of the sphere it is
  // still under whatever hill or neighbour shades the tree.
  let viewPosition = surfaceViewPosition + sunDirection() * (2.0 * reach);

  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  // A rough dielectric: foliage and bark alike at the distance this draws.
  var surface : PbrSurface;
  surface.normal = normal;
  surface.specularNormal = normal;
  surface.geometricNormal = normal;
  surface.viewPosition = surfaceViewPosition;
  surface.diffuseColor = diffuseColorFromBaseColor(baseColor, 0.0);
  surface.f0 = f0FromBaseColor(baseColor, 0.0);
  surface.alpha = perceptualRoughnessToAlpha(1.0);

  let lit = accumulatePbrLighting(
    surface,
    spotLightShadowParams.hasSpotShadow,
    spotLightShadowParams.lightIndex
  );
  let sunShadow = cloudShadowFactor * directionalShadowFactor;
  var color = (lit.directionalDiffuse + lit.directionalSpecular) * sunShadow
            + lit.punctualDiffuse + lit.punctualSpecular
            + (lit.spotShadowDiffuse + lit.spotShadowSpecular) * spotShadowFactor;
  color += evaluateIbl(surface, 1.0);

  var outColor = vec4f(color, 1.0);

  if (directionalShadowParams.debugMode != 0u) {
    outColor = vec4f(mix(outColor.rgb, cascadeDebugTint, 0.5), outColor.a);
  }

  // A floor of a third of the exposed range plus the surface's own light, so
  // the colour reads in shadow and the shading still shows through.
  if (uniforms.debug.y > 0.5) {
    let tier = min(u32(uniforms.debug.x), 3u);
    let luma = dot(outColor.rgb, vec3f(0.299, 0.587, 0.114));
    outColor = vec4f(TIER_TINTS[tier] * (0.35 * uniforms.debug.z + luma), outColor.a);
  }

  return outColor;
}
