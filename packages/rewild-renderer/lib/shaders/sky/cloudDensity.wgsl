// Shared cloud density function.
// Requires in scope: fbm(), pebblesTexture, noiseSampler,
// EARTH_RADIUS, CLOUD_START, CLOUD_HEIGHT (from constants.wgsl).

struct CloudDensityResult {
  density: f32,
  cloudHeight: f32,
};

// `position` must be camera-relative (camera at XZ = 0): the curvature-height
// term below is evaluated against an earth sphere centred under the camera, so
// the model is translation-invariant and doesn't break far from world origin.
// `domainOffset` is the camera's world XZ — added back for noise sampling only,
// keeping the cloud pattern anchored to the world so it parallaxes correctly.
// `drift` is how far the deck has blown (WindState.cloudDrift), integrated on
// the CPU so a wind that turns moves the clouds on rather than jumping them.
// `front` (WindState.cloudFront) makes a changing cloudiness arrive from
// upwind: see frontCloudiness.
// Metres upwind over which the sky eases into its full lean. Wide and smooth,
// so a changing sky shades across the whole view rather than splitting in two.
const FRONT_WIDTH: f32 = 6000.0;

// The cloudiness at a camera-relative position. Overhead it is the sky's; while
// the cloudiness is changing, the sky upwind leans toward where it is heading
// (front.w at the far upwind horizon) and the sky downwind away from it, so
// building cloud shows first upwind and a clearing breaks from upwind.
fn frontCloudiness(position: vec3f, cloudiness: f32, front: vec4f) -> f32 {
  let x = dot(position.xz, front.xy) / FRONT_WIDTH;
  return saturate(cloudiness + front.w * x * inverseSqrt(1.0 + x * x));
}

fn cloudDensity(position: vec3f, domainOffset: vec2f, skyCloudiness: f32, drift: vec2f, front: vec4f) -> CloudDensityResult {
  let cloudiness = frontCloudiness(position, skyCloudiness, front);
  // Single coherent wind offset — all layers move together as one mass
  let windOffset = vec3f(drift.x, 0.0, drift.y);
  // Small turbulence offset for FBM detail layers (subtle internal cloud motion)
  let turbulenceOffset = windOffset * (1.5 / 10.3);
  var p = position + vec3f(domainOffset.x, 0.0, domainOffset.y) + windOffset;

  var result: CloudDensityResult;
  // Calculate the height above the Earth's surface (use original position for height)
  let atmoHeight: f32 = length(position - vec3f(0.0, -EARTH_RADIUS, 0.0)) - EARTH_RADIUS;

  // Normalize the cloud height to a range of 0 to 1
  let cloudHeight = clamp((atmoHeight - CLOUD_START) / CLOUD_HEIGHT, 0.0, 1.0);
  result.cloudHeight = cloudHeight;

  // Sample the large-scale weather pattern
  // Sparse skies use a finer pattern than overcast ones. The two scales are
  // blended rather than the scale itself, which would zoom the pattern about
  // the world origin as the cloudiness changes.
  let weatherThreshold = mix(0.18, 0.04, smoothstep(0.7, 1.0, cloudiness));
  let largeFine = textureSampleLevel(pebblesTexture, noiseSampler, -0.00005 * p.zx, 0.0).x;
  let largeBroad = textureSampleLevel(pebblesTexture, noiseSampler, -0.000015 * p.zx, 0.0).x;
  var largeWeather: f32 = clamp(
    (mix(largeFine, largeBroad, cloudiness) - weatherThreshold) * 5.0 * cloudiness,
    0.0, 6.0
  );

  // Sample the smaller-scale weather pattern and combine with large-scale pattern
  var weather: f32 = largeWeather * max(
    clamp(pow(cloudiness, 12.1), 0.0, 1.0),
    textureSampleLevel(pebblesTexture, noiseSampler, 0.0001 * p.zx, 0.0).x - 0.28
  ) / 0.52;

  // Apply smoothstep to the cloud height to create a smooth transition
  weather *= smoothstep(0.0, 0.5, cloudHeight) * smoothstep(1.0, 0.5, cloudHeight);

  // Shape the clouds using a power function
  let cloudShape: f32 = pow(weather, 0.3 + 1.5 * smoothstep(0.2, 0.5, cloudHeight));

  // If the cloud shape is zero, return early
  if (cloudShape <= 0.0) {
    result.density = 0.0;
    return result;
  }

  // Calculate the cloud density using fractal Brownian motion (fbm)
  // Turbulence offset gives subtle internal motion without breaking the cloud shape
  let fbmErosion = mix(0.7, 0.25, smoothstep(0.7, 1.0, cloudiness));
  var den = max(0.0, cloudShape - fbmErosion * fbm((p + turbulenceOffset) * 0.01));

  // If the cloud density is zero, return early
  if (den <= 0.0) {
    result.density = 0.0;
    return result;
  }

  // Calculate the final cloud density using fbm (slightly more turbulence on fine detail)
  den = max(0.0, den - 0.2 * fbm((p + turbulenceOffset * 2.0) * 0.05));

  // Calculate the final density value based on the cloud density and weather pattern
  result.density = largeWeather * 0.2 * min(1.0, 5.0 * den);

  return result;
}
