// Shared cloud density function.
// Requires in scope: fbm(), pebblesTexture, noiseSampler,
// EARTH_RADIUS, CLOUD_START, CLOUD_HEIGHT (from constants.wgsl).

struct CloudDensityResult {
  density: f32,
  cloudHeight: f32,
};

fn cloudDensity(position: vec3f, windiness: f32, cloudiness: f32, iTime: f32) -> CloudDensityResult {
  let windDirection = vec3f(1.0, 0.0, -1.0) * windiness;
  let cloudinessSpeedFactor = smoothstep(0.9, 1.0, cloudiness);
  let cloudMovementSpeed = iTime * 0.01 * mix(1.0, 3.0, cloudinessSpeedFactor);

  // Single coherent wind offset — all layers move together as one mass
  let windOffset = windDirection * cloudMovementSpeed * 10.3;
  // Small turbulence offset for FBM detail layers (subtle internal cloud motion)
  let turbulenceOffset = windDirection * cloudMovementSpeed * 1.5;
  var p = position + windOffset;

  var result: CloudDensityResult;
  // Calculate the height above the Earth's surface (use original position for height)
  let atmoHeight: f32 = length(position - vec3f(0.0, -EARTH_RADIUS, 0.0)) - EARTH_RADIUS;

  // Normalize the cloud height to a range of 0 to 1
  let cloudHeight = clamp((atmoHeight - CLOUD_START) / CLOUD_HEIGHT, 0.0, 1.0);
  result.cloudHeight = cloudHeight;

  // Sample the large-scale weather pattern
  var largeWeather: f32 = clamp(
    (textureSampleLevel(pebblesTexture, noiseSampler, -mix(0.00005, 0.000015, cloudiness) * p.zx, 0.0).x - 0.18) * 5.0 * cloudiness,
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
  var den = max(0.0, cloudShape - 0.7 * fbm((p + turbulenceOffset) * 0.01));

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
