// Trees past the terrain chunks, out over the far ground the horizon ring
// draws: one billboard per instance from the layer's impostor atlas, placed by
// the far map (FarMapBuilder) and stood on the ring's surface.
//
// Past the far plane depth cannot say how far away a pixel is, so like the
// ring the sprites write depth in the far ground's reserved band: nearer
// sprites lower in it, and all of them below the ring, so a sprite hides the
// ring behind it. The ring cannot hide a sprite that way, so a sprite whose
// crown is behind a far ridge is culled by a march over the ring's heights.
// They fog themselves, since the atmosphere composite takes the band as
// already fogged.
//
// The atlas is sampled and lit as the impostor tier does it
// (scatter-impostor-shading.wgsl), so a tree reads the same either side of the
// handover.
//
// They fill in where the chunks' own instances stop: under a chunk a sprite
// keeps the pixels the chunk's fade leaves, and toward the layer's cull
// distance the pixels its last tier's fade-out leaves.

const HAS_FOLIAGE_SHADING: bool = false;

#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/brdf.wgsl"
#include "./shader-lib/pbr-lighting.wgsl"
#include "./shader-lib/ibl.wgsl"
#include "./shader-lib/scene-output.wgsl"
#include "./shader-lib/water-light.wgsl"
#include "./shader-lib/rain-wet.wgsl"
#include "./shader-lib/caustics.wgsl"
#include "./shader-lib/foliage-lighting.wgsl"
#include "./shader-lib/cloud-shadow.wgsl"
#include "./shader-lib/pcf.wgsl"
#include "./shader-lib/directional-shadow.wgsl"
#include "./shader-lib/spot-light-shadow.wgsl"
#include "./shader-lib/scatter-impostor.wgsl"
#include "./shader-lib/scatter-impostor-shading.wgsl"
#include "./shader-lib/lod-fade.wgsl"
#include "./shader-lib/far-ground.wgsl"
#include "./shader-lib/horizon-ground.wgsl"
#include "./sky/atmosphere-uniforms.wgsl"

// Metres out to which sprites draw, thinning out from SPRITE_THIN_FROM.
const SPRITE_FAR: f32 = 6000.0;
const SPRITE_THIN_FROM: f32 = 4500.0;
// Depth band the sprites spread over by distance, up from FAR_GROUND_DEPTH_MIN
// and short of the ring's FAR_GROUND_DEPTH by a few depth steps.
const SPRITE_DEPTH_SPAN: f32 = 2.5e-7;
// Samples of the march toward a crown over the ring's heights.
const OCCLUSION_STEPS: i32 = 24;
// Metres the ground must stand above the line of sight to hide a crown: the far
// map's heights are coarser than the ground they stand for.
const OCCLUSION_SLACK: f32 = 4.0;
// Far map texels the march stops short of the crown, so the tree's own ground
// cannot hide it.
const OCCLUSION_CLEAR_TEXELS: f32 = 2.0;
const TAU: f32 = 6.283185307;

const CULLED_POSITION = vec4f(0.0, 0.0, 2.0, 1.0);

struct Uniforms {
  normalMatrix : mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4f,
}

struct SpriteLayer {
  // x..y: the metres over which the layer's last tier fades out, ending at its
  // cull distance.
  fade : vec4f,
}

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) uv : vec2f,
  @location(1) viewPosition : vec3f,
  @location(2) world : vec3f,
  // The hemisphere direction the tiles are picked by, model space.
  @location(3) @interpolate(flat) octDir : vec3f,
  @location(4) @interpolate(flat) rotation : vec4f,
  // Fade-pattern value below which a pixel belongs to the chunks.
  @location(5) @interpolate(flat) keepFrom : f32,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

@group(1) @binding(0) var farSampler : sampler;
@group(1) @binding(1) var<uniform> horizon : HorizonParams;
@group(1) @binding(2) var chunkMask : texture_2d<f32>;
@group(1) @binding(3) var nearGround : texture_2d<f32>;
@group(1) @binding(4) var wideGround : texture_2d<f32>;
@group(1) @binding(5) var<uniform> object : FinalUniformStruct;
// Per instance: world x, world z, scale, and a roll from 0 to 1.
@group(1) @binding(6) var<storage, read> sprites : array<vec4f>;
@group(1) @binding(7) var atlasSampler : sampler;
@group(1) @binding(8) var albedoAtlas : texture_2d<f32>;
@group(1) @binding(9) var normalAtlas : texture_2d<f32>;
@group(1) @binding(10) var<uniform> impostor : ImpostorParams;
@group(1) @binding(11) var<uniform> layer : SpriteLayer;

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
@group(3) @binding(12) var causticsMap: texture_2d<f32>;
@group(3) @binding(13) var causticsSampler: sampler;
@group(3) @binding(14) var<uniform> caustics: CausticsParams;
@group(3) @binding(15) var waterLevelMap: texture_2d<f32>;
@group(3) @binding(16) var waterOpticsMap: texture_2d<f32>;

var<private> sunDotUp: f32;

fn rotateByQuat(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

// Whether the ring's ground rises over the line of sight from `eye` to
// `crown`. The march starts at the ring's inner radius, since nearer ground is
// the chunks', which hide what is behind them through depth.
fn occluded(eye: vec3f, crown: vec3f) -> bool {
  let reach = max(distance(eye.xz, crown.xz), 1e-3);
  let texel = horizon.nearSpan / f32(textureDimensions(nearGround).x);
  let start = min(horizon.innerRadius / reach, 1.0);
  let stop = 1.0 - min(OCCLUSION_CLEAR_TEXELS * texel / reach, 1.0);
  for (var i = 0; i < OCCLUSION_STEPS; i++) {
    let t = mix(start, stop, (f32(i) + 0.5) / f32(OCCLUSION_STEPS));
    let q = mix(eye, crown, t);
    if (surfaceHeight(q.xz) > q.y + OCCLUSION_SLACK) {
      return true;
    }
  }
  return false;
}

@vertex
fn vs(
  @location(0) position : vec3f,
  @location(1) uv : vec2f,
  @builtin(instance_index) instanceIndex : u32
) -> VertexOutput {
  var output : VertexOutput;
  let sprite = sprites[instanceIndex];
  let p = sprite.xy;
  let scale = sprite.z;
  let roll = sprite.w;

  // The ring stands at the world origin, so its model-view is the view.
  let mv3 = mat3x3f(
    uniforms.modelViewMatrix[0].xyz,
    uniforms.modelViewMatrix[1].xyz,
    uniforms.modelViewMatrix[2].xyz
  );
  let eye = -(transpose(mv3) * uniforms.modelViewMatrix[3].xyz);

  let base = vec3f(p.x, surfaceHeight(p), p.y);
  let viewDistance = distance(eye, base);
  if (viewDistance >= SPRITE_FAR || smoothstep(SPRITE_THIN_FROM, SPRITE_FAR, viewDistance) > roll) {
    output.Position = CULLED_POSITION;
    return output;
  }

  let lastTier = clamp(
    (layer.fade.y - viewDistance) / max(layer.fade.y - layer.fade.x, 1e-4),
    0.0,
    1.0
  );
  let keepFrom = min(chunkFade(p), lastTier);
  if (keepFrom >= 1.0) {
    output.Position = CULLED_POSITION;
    return output;
  }

  let halfYaw = fract(roll * 7.31) * TAU * 0.5;
  let q = vec4f(0.0, sin(halfYaw), 0.0, cos(halfYaw));
  let centre = base + rotateByQuat(q, impostor.centre.xyz * scale);
  if (occluded(eye, centre)) {
    output.Position = CULLED_POSITION;
    return output;
  }

  let dirModel = rotateByQuat(quatConjugate(q), normalize(eye - centre));
  let octDir = impostorHemiDir(dirModel);
  let right = impostorRight(octDir);
  let up = impostorUp(octDir, right);
  let corner = (right * position.x + up * position.y) * (impostor.centre.w * scale);
  let world = centre + rotateByQuat(q, corner);

  let mvPosition = uniforms.modelViewMatrix * vec4f(world, 1.0);
  var clip = uniforms.projMatrix * mvPosition;
  clip.z = clip.w * (FAR_GROUND_DEPTH_MIN + SPRITE_DEPTH_SPAN * viewDistance / SPRITE_FAR);

  output.Position = clip;
  output.uv = uv;
  output.viewPosition = mvPosition.xyz;
  output.world = world;
  output.octDir = octDir;
  output.rotation = q;
  output.keepFrom = keepFrom;
  return output;
}

@fragment
fn fs(
  @location(0) uv : vec2f,
  @location(1) surfaceViewPosition : vec3f,
  @location(2) world : vec3f,
  @location(3) @interpolate(flat) octDir : vec3f,
  @location(4) @interpolate(flat) rotation : vec4f,
  @location(5) @interpolate(flat) keepFrom : f32,
  @builtin(position) fragCoord : vec4f
) -> SceneFragment {
  if (fadePattern(fragCoord.xy) < keepFrom) {
    discard;
  }

  let texel = sampleImpostor(uv, octDir);
  if (texel.coverage < impostor.atlas.y) {
    discard;
  }

  let mv3 = mat3x3f(
    uniforms.modelViewMatrix[0].xyz,
    uniforms.modelViewMatrix[1].xyz,
    uniforms.modelViewMatrix[2].xyz
  );
  let normal = normalize(mv3 * rotateByQuat(rotation, texel.normal));
  let viewPosition = surfaceViewPosition;

  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  // Past the shadow distance a lookup still lands in the last cascade.
  if (-viewPosition.z > directionalShadowParams.cascadeSplits.z) {
    directionalShadowFactor = 1.0;
  }

  var color = shadeImpostor(
    texel.baseColor,
    normal,
    surfaceViewPosition,
    cloudShadowFactor * directionalShadowFactor,
    spotShadowFactor
  ).rgb;

  // The scene fog, as the atmosphere composite applies it, at the true distance.
  let toSprite = world - object.cameraPosition;
  let spriteDistance = length(toSprite);
  let viewDir = toSprite / max(spriteDistance, 1e-6);
  let toSun = normalize(object.sunPosition);
  sunDotUp = toSun.y;
  let fog = (1.0 - sceneFogTransmittance(object.cameraPosition, viewDir, spriteDistance)) * horizon.fogged;
  color = mix(color, getFogScatterColor(viewDir, toSun), fog);

  return sceneFragment(vec4f(color, 1.0));
}
