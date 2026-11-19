// The displaced patch: a dense grid around the eye whose vertices carry the
// relief the parallax march only fakes. Drawn per chunk as triangle strips,
// one instance per row, over the chunk's own bindings.
//
// Requires from terrain.wgsl: TerrainParams and getLayer, the splat, noise,
// height and albedo bindings, VertexOutput and the blend constants.

// The chunk's LOD-0 surface, one (height, normal) per sample, row-major from
// the chunk's +z edge as MeshGenerator lays its vertices out.
@group(1) @binding(14) var<storage, read> patchSurface: array<vec4f>;

struct PatchBase {
  position: vec3f,
  normal: vec3f,
  uv: vec2f,
}

// The base mesh's surface at object xz, interpolated over the two triangles
// per cell the mesh splits along (gx, gy)–(gx+1, gy+1), so the patch's border
// lies exactly on it.
fn patchBaseSurface(x: f32, z: f32) -> PatchBase {
  let samplesPerSide = u32(round(sqrt(f32(arrayLength(&patchSurface)))));
  let span = f32(samplesPerSide - 1u);
  let metres = terrainParams.patchGrid.w;
  let s = vec2f(x / metres + 0.5 * span, 0.5 * span - z / metres);
  let cell = clamp(floor(s), vec2f(0.0), vec2f(span - 1.0));
  let f = s - cell;
  let i = u32(cell.x) + u32(cell.y) * samplesPerSide;
  let a = patchSurface[i];
  let b = patchSurface[i + 1u];
  let c = patchSurface[i + samplesPerSide];
  let d = patchSurface[i + samplesPerSide + 1u];
  var v: vec4f;
  if (f.y >= f.x) {
    v = a + f.x * (d - c) + f.y * (c - a);
  } else {
    v = a + f.x * (b - a) + f.y * (d - b);
  }
  var out: PatchBase;
  out.position = vec3f(x, v.x, z);
  out.normal = normalize(v.yzw);
  out.uv = s / span;
  return out;
}

// Height in the relief volume that rests on the base mesh. Relief above it
// rises from the base and relief below sinks, so objects placed on the base
// mesh sit on the average surface rather than on its peaks.
const RELIEF_REST_HEIGHT: f32 = 0.5;

// The surface along the base normal in .x (metres, + up), and its depth below
// the relief volume's top in .y: each layer's height through the same no-tile
// taps and height-aware blend the fragment shader shades with, so the geometry
// is the relief on show. Taps read the mip whose texels match the vertex
// spacing.
fn patchRelief(uv: vec2f, normal: vec3f) -> vec2f {
  if (terrainParams.uvPerMetre <= 0.0) {
    return vec2f(0.0);
  }

  let weightsRawLo = textureSampleLevel(splatMap, splatSampler, uv, 0.0);
  let weightsRawHi = textureSampleLevel(splatMapExt, splatSampler, uv, 0.0);
  let invWeightSum = 1.0 / max(
    dot(weightsRawLo, vec4f(1.0)) + dot(weightsRawHi, vec4f(1.0)),
    1e-4
  );
  let sideWeight = smoothstep(BIPLANAR_START, BIPLANAR_END, 1.0 - abs(normal.y));
  let texels = f32(textureDimensions(heightArray).x);
  let spacing = terrainParams.patchGrid.z;

  var offsets = array<f32, 8>();
  var depths = array<f32, 8>();
  var scores = array<f32, 8>();
  var layerActive = array<f32, 8>();
  var weightFade = array<f32, 8>();
  var blendDepthSum = 0.0;
  var blendDepthWeight = 0.0;
  var maxScore = -1e9;

  for (var slot = 0u; slot < SPLAT_SLOTS; slot++) {
    var weight = 0.0;
    if (slot < 4u) {
      weight = weightsRawLo[slot] * invWeightSum;
    } else {
      weight = weightsRawHi[slot - 4u] * invWeightSum;
    }
    if (weight < WEIGHT_EPSILON) {
      continue;
    }

    let layer = getLayer(slot);
    let arrayIndex = i32(layer.layerIndex);
    let scaledUV = uv * layer.uvScale;
    let lod = log2(max(spacing * layer.uvScale * terrainParams.uvPerMetre * texels, 1.0));

    let k = textureSampleLevel(
      noiseTexture,
      seamlessSampler,
      (uv + terrainParams.chunkUV) * layer.uvScale * terrainParams.noiseScale,
      0.0
    ).x;
    let index = k * 8.0;
    let i = floor(index);
    let f = fract(index);
    let uvA = scaledUV + sin(vec2f(3.0, 7.0) * i);
    var height = textureSampleLevel(heightArray, seamlessSampler, uvA, arrayIndex, lod).r;

    if (HAS_TERRAIN_NO_TILE && sideWeight < 1.0) {
      let uvB = scaledUV + sin(vec2f(3.0, 7.0) * (i + 1.0));
      let cola = textureSampleLevel(albedoArray, seamlessSampler, uvA, arrayIndex, lod).rgb;
      let colb = textureSampleLevel(albedoArray, seamlessSampler, uvB, arrayIndex, lod).rgb;
      let blendFactor = smoothstep(0.2, 0.8, f - 0.1 * dot(cola - colb, vec3f(1.0)));
      let heightB = textureSampleLevel(heightArray, seamlessSampler, uvB, arrayIndex, lod).r;
      height = mix(height, heightB, blendFactor);
    }

    let metresPerTileUV = 1.0 / (layer.uvScale * terrainParams.uvPerMetre);
    let volume = layer.heightScale * (1.0 - sideWeight) * metresPerTileUV;
    offsets[slot] = (height - RELIEF_REST_HEIGHT) * volume;
    depths[slot] = (1.0 - height) * volume;
    weightFade[slot] = smoothstep(WEIGHT_EPSILON, WEIGHT_FADE_END, weight);
    let score = weight + (height - 0.5);
    scores[slot] = score;
    layerActive[slot] = 1.0;
    maxScore = max(maxScore, score);
    blendDepthSum += weight * layer.blendDepth;
    blendDepthWeight += weight;
  }

  let blendDepth = max(blendDepthSum / max(blendDepthWeight, 1e-4), 1e-4);
  let cutoff = maxScore - blendDepth;
  var relief = vec2f(0.0);
  var contributionSum = 0.0;
  for (var slot = 0u; slot < SPLAT_SLOTS; slot++) {
    if (layerActive[slot] == 0.0) {
      continue;
    }
    let t = clamp((scores[slot] - cutoff) / blendDepth, 0.0, 1.0);
    let contribution = t * t * (3.0 - 2.0 * t) * weightFade[slot];
    relief += contribution * vec2f(offsets[slot], depths[slot]);
    contributionSum += contribution;
  }
  return select(vec2f(0.0), relief / contributionSum, contributionSum > 1e-6);
}

@vertex
fn vsPatch(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) row: u32
) -> VertexOutput {
  let grid = terrainParams.patchGrid;
  let x = grid.x + f32(vertexIndex / 2u) * grid.z;
  let z = grid.y - f32(row + 1u - (vertexIndex & 1u)) * grid.z;
  let ground = patchBaseSurface(x, z);

  let patchView = terrainParams.patchView;
  let fade = 1.0 - smoothstep(patchView.z, patchView.w, distance(vec2f(x, z), patchView.xy));
  var relief = vec2f(0.0);
  if (fade > 0.0) {
    relief = patchRelief(ground.uv, ground.normal) * fade;
  }
  let displacement = ground.normal * relief.x;
  let position = ground.position + displacement;

  var output: VertexOutput;
  let mvPosition = uniforms.modelViewMatrix * vec4f(position, 1.0);
  output.Position = uniforms.projMatrix * mvPosition;
  output.viewPosition = (uniforms.modelViewMatrix * vec4f(ground.position, 1.0)).xyz;
  output.surfaceOffset = mvPosition.xyz - output.viewPosition;
  output.fragUV = ground.uv;
  output.normal = uniforms.normalMatrix * ground.normal;
  output.objectNormal = ground.normal;
  output.objectHeight = position.y;
  output.reliefDepth = max(relief.y, 0.0);
  return output;
}
