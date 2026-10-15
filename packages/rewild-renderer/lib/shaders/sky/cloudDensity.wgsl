// Shared cloud density function.
// Requires in scope: pebblesTexture, noiseSampler, shapeVolume, detailVolume
// (texture_3d<f32>, from CloudNoiseVolumes), EARTH_RADIUS, CLOUD_START, CLOUD_HEIGHT
// (from constants.wgsl).

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

// The erosion thresholds below were tuned against three octaves of [0, 1] value
// noise, so both volumes are remapped to that noise's mean and deviation. The
// shape-only density subtracts the mean in place of the detail term, so it
// matches the full density on average.
const EROSION_NOISE_MEAN: f32 = 0.4376;
const EROSION_NOISE_STD: f32 = 0.1058;
const SHAPE_NOISE_MEAN: f32 = 0.8307;
const SHAPE_NOISE_STD: f32 = 0.0504;
const DETAIL_NOISE_MEAN: f32 = 0.4814;
const DETAIL_NOISE_STD: f32 = 0.1141;

// World extent of one tile of each volume. A shape tile holds 8 base cells and a
// detail tile 4, putting their billows at 100 m and 20 m.
const SHAPE_VOLUME_METRES: f32 = 800.0;
const DETAIL_VOLUME_METRES: f32 = 80.0;

// Fraction of the deck, from its base, over which the detail turns from wispy to
// billowy.
const DETAIL_WISP_HEIGHT: f32 = 0.2;

// Mip whose texels match `footprint`, the width in metres one sample stands for.
// Level 0 everywhere would alias distant cloud and miss the cache on every tap.
fn volumeLod(volume: texture_3d<f32>, volumeMetres: f32, footprint: f32) -> f32 {
  let texelMetres = volumeMetres / f32(textureDimensions(volume).x);
  return max(0.0, log2(footprint / texelMetres));
}

// Perlin-Worley shape noise as an erosion term: low on the billows, so they
// survive the subtraction.
fn shapeErosion(p: vec3f, footprint: f32) -> f32 {
  let lod = volumeLod(shapeVolume, SHAPE_VOLUME_METRES, footprint);
  let texel = textureSampleLevel(shapeVolume, noiseSampler, p / SHAPE_VOLUME_METRES, lod);
  let lowFreqFbm = texel.g * 0.625 + texel.b * 0.25 + texel.a * 0.125;
  let base = saturate((texel.r - (lowFreqFbm - 1.0)) / (2.0 - lowFreqFbm));
  return EROSION_NOISE_MEAN + (SHAPE_NOISE_MEAN - base) * (EROSION_NOISE_STD / SHAPE_NOISE_STD);
}

// Worley detail as an erosion term. Near the base it eats the cells' centres and
// leaves wisps; higher up it eats between them and leaves billows.
fn detailErosion(p: vec3f, cloudHeight: f32, footprint: f32) -> f32 {
  let lod = volumeLod(detailVolume, DETAIL_VOLUME_METRES, footprint);
  let texel = textureSampleLevel(detailVolume, noiseSampler, p / DETAIL_VOLUME_METRES, lod);
  let cells = texel.r * 0.625 + texel.g * 0.25 + texel.b * 0.125;
  let billow = saturate(cloudHeight / DETAIL_WISP_HEIGHT);
  let erosion = mix(cells, 1.0 - cells, billow);
  let erosionMean = mix(DETAIL_NOISE_MEAN, 1.0 - DETAIL_NOISE_MEAN, billow);
  return EROSION_NOISE_MEAN + (erosion - erosionMean) * (EROSION_NOISE_STD / DETAIL_NOISE_STD);
}

// `footprint` is the width in metres the sample stands for, which picks the
// volumes' mip level.
fn cloudDensity(position: vec3f, domainOffset: vec2f, skyCloudiness: f32, drift: vec2f, front: vec4f, footprint: f32) -> CloudDensityResult {
  return cloudDensityDetail(position, domainOffset, skyCloudiness, drift, front, footprint, true);
}

// cloudDensity without the fine-detail octaves: one noise lookup fewer per sample.
// For consumers that blur the result anyway — shadow maps, distant light-ray samples.
fn cloudDensityShape(position: vec3f, domainOffset: vec2f, skyCloudiness: f32, drift: vec2f, front: vec4f, footprint: f32) -> CloudDensityResult {
  return cloudDensityDetail(position, domainOffset, skyCloudiness, drift, front, footprint, false);
}

fn cloudDensityDetail(position: vec3f, domainOffset: vec2f, skyCloudiness: f32, drift: vec2f, front: vec4f, footprint: f32, fineDetail: bool) -> CloudDensityResult {
  let cloudiness = frontCloudiness(position, skyCloudiness, front);
  // Single coherent wind offset — all layers move together as one mass
  let windOffset = vec3f(drift.x, 0.0, drift.y);
  // Small turbulence offset for the noise volumes (subtle internal cloud motion)
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

  // Erode the shape with the Perlin-Worley volume
  // Turbulence offset gives subtle internal motion without breaking the cloud shape
  let shapeErosionStrength = mix(0.7, 0.25, smoothstep(0.7, 1.0, cloudiness));
  var den = max(0.0, cloudShape - shapeErosionStrength * shapeErosion(p + turbulenceOffset, footprint));

  // If the cloud density is zero, return early
  if (den <= 0.0) {
    result.density = 0.0;
    return result;
  }

  // Erode the edges with the Worley detail volume (slightly more turbulence on fine detail)
  var detailNoise = EROSION_NOISE_MEAN;
  if (fineDetail) {
    detailNoise = detailErosion(p + turbulenceOffset * 2.0, cloudHeight, footprint);
  }
  den = max(0.0, den - 0.2 * detailNoise);

  // Calculate the final density value based on the cloud density and weather pattern
  result.density = largeWeather * 0.2 * min(1.0, 5.0 * den);

  return result;
}
