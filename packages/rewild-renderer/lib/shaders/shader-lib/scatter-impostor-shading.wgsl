// What the impostor tier and the far sprites shade alike: the octahedral atlas
// blended for a view, and the billboard lit as the layer's mesh is.
//
// The host declares `atlasSampler`, `albedoAtlas`, `normalAtlas` and
// `impostor : ImpostorParams`, and the lighting and environment bindings the
// lighting includes read. Include after scatter-impostor.wgsl.

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

struct ImpostorTexel {
  baseColor : vec3f,
  // Model space.
  normal : vec3f,
  // Compared against impostor.atlas.y to cut the silhouette.
  coverage : f32,
}

// The atlas at `uv` seen along `octDir`, model space. Tile centres sit at the
// corners of a (views - 1)² grid over the octahedral square, and the three
// tiles of the triangle the direction lands in share the blend by barycentric
// weight.
fn sampleImpostor(uv : vec2f, octDir : vec3f) -> ImpostorTexel {
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

  let albedo = a.albedo + b.albedo + c.albedo;
  let normal = a.normal + b.normal + c.normal;

  var texel : ImpostorTexel;
  texel.baseColor = albedo.rgb / max(albedo.a, 1e-4);
  texel.normal = normalize((normal.xyz / max(normal.a, 1e-4)) * 2.0 - 1.0);
  texel.coverage = albedo.a * (1.0 + 0.6 * tileMipLevel(uv));
  return texel;
}

// A billboard texel lit as its layer: `normal` and `viewPosition` in view
// space, under the sun's and the spot light's shadow factors.
fn shadeImpostor(
  baseColor : vec3f,
  normal : vec3f,
  viewPosition : vec3f,
  sunShadow : f32,
  spotShadow : f32
) -> vec4f {
  // A foliage layer's crown is most of what the atlas holds, so the whole
  // billboard takes the foliage lobes; the trunk's share is too few texels at
  // this range to shade apart. A uniform branch, so the samples inside stay in
  // uniform control flow.
  if (impostor.atlas.z > 0.5) {
    return shadeFoliage(baseColor, normal, viewPosition, sunShadow);
  }

  // A rough dielectric: bark and rock alike at the distance this draws.
  let rainUp = (iblParams.viewToWorld * vec4f(normal, 0.0)).y;
  let wetColor = rainWet(baseColor, 1.0, 0.0, rainUp, 0.0).color;
  var surface : PbrSurface;
  surface.normal = normal;
  surface.specularNormal = normal;
  surface.geometricNormal = normal;
  surface.viewPosition = viewPosition;
  surface.diffuseColor = diffuseColorFromBaseColor(wetColor, 0.0);
  surface.f0 = f0FromBaseColor(wetColor, 0.0);
  surface.alpha = perceptualRoughnessToAlpha(1.0);

  let lit = accumulatePbrLighting(
    surface,
    spotLightShadowParams.hasSpotShadow,
    spotLightShadowParams.lightIndex
  );
  let water = waterLightAt(viewPosition);
  let indirect = evaluateIbl(surface, 1.0) * water.sky;
  sceneIndirect = indirect;
  let color = (lit.directionalDiffuse + lit.directionalSpecular) * sunShadow * water.sun
            + lit.punctualDiffuse + lit.punctualSpecular
            + (lit.spotShadowDiffuse + lit.spotShadowSpecular) * spotShadow
            + indirect;
  return vec4f(color, 1.0);
}
