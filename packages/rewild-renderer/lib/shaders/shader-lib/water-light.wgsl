// Under water, light reaching a surface has crossed the water: the sun along
// its refracted path, the sky along slant paths WATER_LIGHT_SKY_SLANT × the
// depth. The water is the one around the camera (UnderWater), its level and
// extinction in iblParams; a surface below that level is taken to be in it.
// The host includes ibl.wgsl.

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
  let world = iblParams.viewToWorld * vec4f(viewPosition, 1.0);
  let depth = iblParams.water.x - world.y;
  if (depth <= 0.0) {
    return out;
  }
  let extinction = iblParams.waterExtinction.rgb;
  out.sun = exp(-extinction * depth / max(iblParams.waterExtinction.a, 0.05));
  out.sky = exp(-extinction * depth * WATER_LIGHT_SKY_SLANT);
  return out;
}
