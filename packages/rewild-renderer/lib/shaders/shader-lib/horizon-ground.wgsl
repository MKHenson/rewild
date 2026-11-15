// The far ground the horizon ring draws, as anything standing on it reads it:
// the ring's parameters, the far map levels' ground, and the chunk mask.
//
// The host declares `horizon : HorizonParams`, `farSampler`, `nearGround`,
// `wideGround` and `chunkMask`.

struct HorizonParams {
  // Chunk visibility centre (world x, z).
  centre : vec2f,
  // Metres from the centre the ring starts.
  innerRadius : f32,
  chunkSize : f32,
  // Centre (world x, z) and span in metres of each far map level.
  nearCentre : vec2f,
  nearSpan : f32,
  seaLevel : f32,
  wideCentre : vec2f,
  wideSpan : f32,
  // Water roughness.
  roughness : f32,
  // The continent's coast value and blend half-width.
  coast : f32,
  blendHalfWidth : f32,
  // The chunk coordinates the chunk mask is centred on.
  maskOrigin : vec2f,
  // The ocean's scattered deep colour.
  scatter : vec3f,
  // Mean square slope of the waves (Cox and Munk). At this range none of
  // them resolve, so all of it widens the reflection, as it does on far chunk
  // water: a smooth mirror of the horizon sky reads far too bright.
  slopeVariance : f32,
  // Metres from the centre of the last finite ring.
  outerRadius : f32,
  // Metres from the centre the land starts flattening to sea level.
  fadeStart : f32,
  // 1 when the atmosphere composite runs, so the ring fogs itself.
  fogged : f32,
  // Albedo array layer of palette channels 0-3 and 4-7.
  paletteLayers : array<vec4f, 2>,
  // Normal and ARM array layer of the material tiled over the far ground, its
  // normal map's green sign, metres per tile, and strength.
  detailLayer : f32,
  detailYSign : f32,
  detailTile : f32,
  detailStrength : f32,
}

// How much of the near level to use: all of it inside, handing over to the wide
// level before its edge.
fn nearWeight(nearUV: vec2f) -> f32 {
  let edge = min(min(nearUV.x, 1.0 - nearUV.x), min(nearUV.y, 1.0 - nearUV.y));
  return smoothstep(0.02, 0.08, edge);
}

fn nearUVAt(p: vec2f) -> vec2f {
  return (p - horizon.nearCentre) / horizon.nearSpan + 0.5;
}

fn wideUVAt(p: vec2f) -> vec2f {
  return (p - horizon.wideCentre) / horizon.wideSpan + 0.5;
}

// Ground height in metres, sea bed included, and the continent value at p.
fn sampleGround(p: vec2f) -> vec2f {
  let nearUV = nearUVAt(p);
  let near = textureSampleLevel(nearGround, farSampler, nearUV, 0.0).rg;
  let wide = textureSampleLevel(wideGround, farSampler, wideUVAt(p), 0.0).rg;
  return mix(wide, near, nearWeight(nearUV));
}

fn groundHeight(p: vec2f) -> f32 {
  return sampleGround(p).x;
}

// The ring's surface height at p: the ground, or the sea over water, flattened
// to sea level by the outer radius.
fn surfaceHeight(p: vec2f) -> f32 {
  let ground = max(groundHeight(p), horizon.seaLevel);
  let flatten = smoothstep(horizon.fadeStart, horizon.outerRadius, distance(p, horizon.centre));
  return mix(ground, horizon.seaLevel, flatten);
}

// How far the terrain chunk at p has faded in, 0 to 1. A chunk in range but not
// yet meshed reads 0, so the ring fills it instead of leaving sky.
fn chunkFade(p: vec2f) -> f32 {
  let size = vec2i(textureDimensions(chunkMask));
  // floor(x + 0.5) rounds as Math.round does on the CPU.
  let cell = vec2i(floor(p / horizon.chunkSize + 0.5) - horizon.maskOrigin) + size / 2;
  if (any(cell < vec2i(0)) || any(cell >= size)) {
    return 0.0;
  }
  return textureLoad(chunkMask, cell, 0).r;
}
