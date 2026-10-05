// Under water, light reaching a surface has crossed the water: the sun along
// its refracted path, the sky along slant paths WATER_LIGHT_SKY_SLANT × the
// depth. The water is the one over the surface, from the water level field
// around the camera (WaterLevelField): waterLevelMap holds each texel's level
// and coverage, waterOpticsMap its extinction per metre. A surface outside the
// field, or under no water, is not dimmed. The waves focus the sun into
// caustics on it. The host includes ibl.wgsl and caustics.wgsl, and binds the
// two maps.

const WATER_LIGHT_SKY_SLANT: f32 = 1.2;

struct WaterLight {
  // What reaches the surface of the sun's light, and of the sky's.
  sun : vec3f,
  sky : vec3f,
}

// The water at field texel position `p`: x its level, y its coverage,
// filtered as the water maps are, the level weighted by coverage so dry
// texels do not pull it down. Zero coverage outside the field.
fn waterLevelAt(p: vec2f) -> vec2f {
  let base = vec2i(floor(p));
  let size = vec2i(textureDimensions(waterLevelMap));
  if (any(base < vec2i(0)) || any(base + 1 >= size)) {
    return vec2f(0.0);
  }
  let f = p - vec2f(base);
  let a = textureLoad(waterLevelMap, base, 0).rg;
  let b = textureLoad(waterLevelMap, base + vec2i(1, 0), 0).rg;
  let c = textureLoad(waterLevelMap, base + vec2i(0, 1), 0).rg;
  let d = textureLoad(waterLevelMap, base + vec2i(1, 1), 0).rg;
  let wa = (1.0 - f.x) * (1.0 - f.y) * a.y;
  let wb = f.x * (1.0 - f.y) * b.y;
  let wc = (1.0 - f.x) * f.y * c.y;
  let wd = f.x * f.y * d.y;
  let coverage = wa + wb + wc + wd;
  if (coverage <= 0.0) {
    return vec2f(0.0);
  }
  return vec2f((wa * a.x + wb * b.x + wc * c.x + wd * d.x) / coverage, coverage);
}

// The water's dimming at a view-space position.
fn waterLightAt(viewPosition: vec3f) -> WaterLight {
  var out: WaterLight;
  out.sun = vec3f(1.0);
  out.sky = vec3f(1.0);
  if (iblParams.water.z <= 0.0) {
    return out;
  }
  let offset = (iblParams.viewToWorld * vec4f(viewPosition, 0.0)).xyz;
  let world = offset + iblParams.viewToWorld[3].xyz;
  let p = (world.xz - iblParams.water.xy) / iblParams.water.z;
  let water = waterLevelAt(p);
  let depth = water.x - world.y;
  if (water.y <= 0.0 || depth <= 0.0) {
    return out;
  }
  let extinction = textureLoad(waterOpticsMap, vec2i(round(p)), 0).rgb;
  let focus = causticLight(causticsPlace(offset.xz), depth, length(viewPosition), caustics.water.x);
  let sun = exp(-extinction * depth / max(iblParams.waterSun.x, 0.05)) * focus;
  let sky = exp(-extinction * depth * WATER_LIGHT_SKY_SLANT);
  let share = saturate(water.y);
  out.sun = mix(vec3f(1.0), sun, share);
  out.sky = mix(vec3f(1.0), sky, share);
  return out;
}
