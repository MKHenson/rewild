// Parallax occlusion mapping for the standard material — terrain.wgsl's march
// over a single height map rather than a texture array, and with no per-tap
// height to hand back for a splat blend.
//
// Requires from the including shader, by these exact names:
//   - heightMap, whose R channel is height: 1 at the polygon surface, 0 at the
//     deepest crevice, and mySampler to read it with.
//
// Fragment-only. The march breaks out early, which is non-uniform control flow —
// where WGSL forbids textureSample and dpdx/dpdy — so every tap takes explicit
// gradients and the caller computes them once in uniform control flow.

// March step counts. The count scales with view angle: MIN steps head-on, where
// the ray barely moves across UV, up to MAX at grazing, where it sweeps far and
// would stair-step through thin ridges without them.
const POM_MIN_STEPS: f32 = 8.0;
const POM_MAX_STEPS: f32 = 16.0;

// Binary-search bisections refining the crossing the linear march brackets
// (relief mapping, Policarpo 2005). Linear interpolation across the last step
// assumes the surface is a straight ramp between the two samples, which terraces
// on steep relief; bisection re-samples instead. Each halves the depth error, so
// 6 turns the coarsest 8-step march into 8·2^6 = 512 effective depth levels —
// banding gone for six extra taps.
const POM_REFINE_STEPS: i32 = 6;

// Grazing floor for the view ray's z (= N·V). Travel is viewTS.xy / viewTS.z,
// which runs away as the surface turns edge-on: a screen pixel then covers a
// huge texture swath and adjacent pixels march to unrelated intersections — the
// grazing "heat-mirage" smear. Flooring z caps that travel uniformly, trading
// literal-correct parallax at extreme grazing (which smears anyway) for a stable
// shallow offset. Capping travel is the right lever: fading depth by orientation
// instead draws N·V contour rings across curved surfaces.
const POM_MIN_VIEW_Z: f32 = 0.6;

// One tap of the height map as *depth* into the volume: 0 at the top surface,
// 1 at the deepest crevice. POM references the top and only ever carves inward —
// all a height map on a flat face can honestly show — so the ray starts at depth
// 0 and marches down until the surface rises to meet it.
fn sampleParallaxDepth(uv: vec2f, ddx: vec2f, ddy: vec2f) -> f32 {
  return 1.0 - textureSampleGrad(heightMap, mySampler, uv, ddx, ddy).r;
}

// Marches the view ray through the height volume and returns the UV where it
// first crosses the surface. Unlike a single-step offset it self-occludes — near
// relief hides far relief — which is what lets it hold at the grazing angles
// that make the single step swim.
//
// `viewTS` is the tangent-space surface→eye direction; `amplitude` is the
// volume's depth in UV units, already faded by distance.
fn parallaxOcclusionUV(
  startUV: vec2f,
  ddx: vec2f,
  ddy: vec2f,
  viewTS: vec3f,
  amplitude: f32
) -> vec2f {
  // No volume to march — a material with no height map, or one faded out by
  // distance. Skip the taps rather than converge on the UV we started at.
  if (amplitude < 1e-4) {
    return startUV;
  }

  let viewZ = max(viewTS.z, POM_MIN_VIEW_Z);
  let numLayers = mix(POM_MAX_STEPS, POM_MIN_STEPS, clamp(viewZ, 0.0, 1.0));
  let layerDepth = 1.0 / numLayers;
  // Total UV the ray sweeps across the full depth of the volume, and the step.
  let deltaUV = (viewTS.xy / viewZ) * amplitude * layerDepth;

  var currentUV = startUV;
  var currentLayerDepth = 0.0;
  var currentDepth = sampleParallaxDepth(currentUV, ddx, ddy);

  // Linear march down the ray until the sampled surface is above the ray depth.
  // This only *brackets* the crossing — the true intersection lies in the last
  // step, between prevUV (ray still above surface) and currentUV (ray now
  // below). The fixed MAX bound is a safety cap; the break fires after
  // `numLayers` steps, when currentLayerDepth reaches 1.0 ≥ any depth.
  for (var s = 0; s < i32(POM_MAX_STEPS); s++) {
    if (currentLayerDepth >= currentDepth) {
      break;
    }
    currentUV -= deltaUV;
    currentDepth = sampleParallaxDepth(currentUV, ddx, ddy);
    currentLayerDepth += layerDepth;
  }

  var uvAbove = currentUV + deltaUV;              // ray above surface
  var uvBelow = currentUV;                        // ray below surface
  var depthAbove = currentLayerDepth - layerDepth;
  var depthBelow = currentLayerDepth;
  for (var b = 0; b < POM_REFINE_STEPS; b++) {
    let uvMid = 0.5 * (uvAbove + uvBelow);
    let depthMid = 0.5 * (depthAbove + depthBelow);
    if (depthMid >= sampleParallaxDepth(uvMid, ddx, ddy)) {
      uvBelow = uvMid;
      depthBelow = depthMid;
    } else {
      uvAbove = uvMid;
      depthAbove = depthMid;
    }
  }

  // The bracket is tight after the bisections, so its midpoint is the hit.
  return 0.5 * (uvAbove + uvBelow);
}
