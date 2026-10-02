// Under water, light reaching a surface has crossed the water: the sun along
// its refracted path, the sky along slant paths WATER_LIGHT_SKY_SLANT × the
// depth. The water is the one around the camera (UnderWater), its level and
// extinction in iblParams; a surface below that level is taken to be in it.
// The waves focus the sun into caustics on it. The host includes ibl.wgsl and
// caustics.wgsl.

const WATER_LIGHT_SKY_SLANT: f32 = 1.2;

struct WaterLight {
  // What reaches the surface of the sun's light, and of the sky's.
  sun : vec3f,
  sky : vec3f,
}

// The water's dimming at a view-space position.
fn waterLightAt(viewPosition: vec3f) -> WaterLight {
  var out: WaterLight;
  out.sun = vec3f(1.0);
  out.sky = vec3f(1.0);
  if (iblParams.water.y < 0.5) {
    return out;
  }
  let offset = (iblParams.viewToWorld * vec4f(viewPosition, 0.0)).xyz;
  let depth = iblParams.water.x - (offset.y + iblParams.viewToWorld[3].y);
  if (depth <= 0.0) {
    return out;
  }
  let extinction = iblParams.waterExtinction.rgb;
  let focus = causticLight(causticsPlace(offset.xz), depth, length(viewPosition), caustics.water.x);
  out.sun = exp(-extinction * depth / max(iblParams.waterExtinction.a, 0.05)) * focus;
  out.sky = exp(-extinction * depth * WATER_LIGHT_SKY_SLANT);
  return out;
}
