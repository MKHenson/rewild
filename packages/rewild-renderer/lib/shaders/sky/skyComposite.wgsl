// Exposure constant: maps HDR scene values into the ACES tone curve's useful range.
// At 0.045, blue sky ~7 HDR → ACES(0.31) ≈ 0.31; clouds at 40 HDR → ACES(1.8) ≈ 0.91;
// uncapped sun corona at ~290 HDR → ACES(13.05) clamps to 1.0 (by ACES design).
// The sky cap at 100 HDR (in blend pass) prevents sun scatter from over-brightening
// semi-transparent cloud edges while still allowing the full sun to shine through sky-only pixels.
const HDR_SCALE: f32 = 0.06;

struct FinalUniformStruct {
    invViewProjectionMatrix: mat4x4<f32>,
    invViewMatrix: mat4x4<f32>,
    resolution: vec2f,
    iTime: f32,
    cloudiness: f32,
    sunPosition: vec3f,
    cameraPosition: vec3f,
    padding0: f32,
    foginess: f32,
    temperature: f32,
    lightningFlash: f32,
};

@group(0) @binding(0)
var intermediateHDR: texture_2d<f32>;

@group(0) @binding(1)
var<uniform> object: FinalUniformStruct;

@group(0) @binding(2)
var cloudsSampler: sampler;

@group( 0 ) @binding(3)
var depthTexture: texture_depth_2d;

@group(0) @binding(4)
var godRaysTexture: texture_2d<f32>;

@group(0) @binding(5)
var bloomHighlights: texture_2d<f32>;

var<private> sunDotUp: f32;


@fragment fn fs(
  @builtin(position) fragCoord: vec4<f32>,
  ) -> @location(0) vec4f {
  // Define uv based on fragCoord
  let uv = fragCoord.xy / vec2(object.resolution);

  // God rays carry HDR in-scattered radiance and are folded into the scene HDR
  // *before* ACES, so the tone curve's shoulder rolls off bright shafts and they
  // read as light rather than as a translucent overlay painted on the final image.
  //
  // Sampled as a 5-tap cross at the god-ray buffer's own texel spacing. That buffer
  // is half resolution and its depth mask changes abruptly at terrain silhouettes;
  // a single bilinear tap turns that step into a 1-2 pixel dark stroke outlining
  // every ridge. Spreading the fetch converts the stroke into a gradient wide
  // enough to read as shading. The effect is low-frequency, so nothing is lost.
  let grTexel = 1.0 / vec2f(textureDimensions(godRaysTexture));
  let godRays = (
      textureSampleLevel(godRaysTexture, cloudsSampler, uv, 0).rgb +
      textureSampleLevel(godRaysTexture, cloudsSampler, uv + vec2f( grTexel.x, 0.0), 0).rgb +
      textureSampleLevel(godRaysTexture, cloudsSampler, uv + vec2f(-grTexel.x, 0.0), 0).rgb +
      textureSampleLevel(godRaysTexture, cloudsSampler, uv + vec2f(0.0,  grTexel.y), 0).rgb +
      textureSampleLevel(godRaysTexture, cloudsSampler, uv + vec2f(0.0, -grTexel.y), 0).rgb
    ) * 0.2;

  // Lightning screen flash: brightest at centre, dimmed at edges
  let flashVignette = 1.0 - smoothstep(0.3, 1.0, length(uv - vec2<f32>(0.5, 0.5)));
  let flash = object.lightningFlash * 0.7 * (0.6 + flashVignette * 0.4);

  // Dither, applied to every output path below. This pass writes to an 8-bit
  // swapchain, and ACES compresses a night sky into a handful of output levels — a
  // smooth gradient then lands on so few steps that the boundaries read as contour
  // bands. Half an LSB of triangular noise pushes each pixel across the rounding
  // threshold at a rate proportional to where it sits between two levels, turning
  // the steps into noise the eye integrates back into a gradient. Amplitude is
  // deliberately sub-LSB: enough to break the contours, not enough to see as grain.
  let dither = triangularDither(fragCoord.xy);

  // Convert uv to texture coordinates
  let texCoord = vec2<i32>(uv * vec2<f32>(textureDimensions(depthTexture)));

  // Load the depth value directly
  let rawDepth = textureLoad(depthTexture, texCoord, 0);

  // Sample the HDR composite (sky + clouds pre-blended by the blend sub-pass)
  // and the HDR bloom highlights (sourced from the same composite).
  // Adding bloom before ACES lets the shoulder naturally compress overbright
  // areas into a smooth glow rather than a hard LDR ring.
  let hdrBlend = textureSampleLevel(intermediateHDR, cloudsSampler, uv, 0);
  let bloom    = textureSampleLevel(bloomHighlights, cloudsSampler, uv, 0);

  if ( rawDepth < 1.0 ) {
    // When camera is above/inside the cloud layer, terrain below the cloud top
    // should be occluded by clouds. The blended sky+cloud texture already
    // contains the correct view through the cloud volume. Without this check,
    // the terrain fog branch double-processes the cloud data and produces dark
    // output because getFogColor + tone mapping are designed for ground-level viewing.
    let cameraAltitude = object.cameraPosition.y;
    let aboveCloudBlend = smoothstep(CLOUD_START, CLOUD_START + 100.0, cameraAltitude);
    let worldPos = worldFromScreenCoord( uv, rawDepth );
    let terrainBelowClouds = smoothstep(CLOUD_START + CLOUD_HEIGHT + 100.0, CLOUD_START, worldPos.y);
    let cloudOcclusion = aboveCloudBlend * terrainBelowClouds * hdrBlend.a;

    if (cloudOcclusion > 0.99) {
      // Terrain fully occluded by clouds — tonemap and use sky+cloud view directly.
      // What is visible here is sky, so the shafts apply at full strength.
      let occludedColor = tonemapACES(HDR_SCALE * (hdrBlend.rgb + bloom.rgb + godRays)) + flash;
      return vec4f(occludedColor + dither, 1.0);
    }

    let dir: vec3f = normalize( worldPos - object.cameraPosition );
    let sunDirection: vec3f = normalize( object.sunPosition );

    // Fog opacity from the exponential height-fog model (fog.wgsl), integrated
    // along the camera→pixel ray. The layer is anchored to world height, so fog
    // pools over low terrain instead of tracking the camera's eye level.
    let distance = length(worldPos - object.cameraPosition);
    let fogFactor = 1.0 - fogTransmittance(object.cameraPosition, dir, distance);

    sunDotUp = dot(sunDirection, vec3f(0.0, 1.0, 0.0));

    // Fully-saturated fog colour; fogFactor (the src-alpha of this pass) controls
    // how much of it covers the terrain, so no distance fade is baked into the
    // colour itself. Works at any camera altitude — no sphere intersection involved.
    let rawFogColor = getFogScatterColor( dir, sunDirection );

    // In-scattering accumulates along the camera ray, so a rock a few metres away
    // catches almost none of the shaft that fills the valley behind it. This uses its
    // own distance ramp rather than fogFactor: fog density bottoms out near 2e-5/m,
    // so on a clear day fogFactor is ~0.01 and would scale the shafts to nothing.
    let rayDepthFade = 1.0 - exp(-distance * 0.0033);
    let godRaysTerrain = godRays * rayDepthFade;

    // Single ACES pass over the full HDR fog value — no separate exp curve.
    let fogTonemapped = tonemapACES(HDR_SCALE * (rawFogColor + godRaysTerrain));

    // This pass composites over the already-shaded terrain with src-alpha, so colour
    // added here is scaled by the coverage term on the way out. A shaft is medium
    // radiance sitting in front of the terrain, so it has to raise coverage as well —
    // otherwise the near-zero clear-air fogFactor multiplies it straight back out.
    let rayCoverage = saturate(dot(godRaysTerrain, vec3f(0.2126, 0.7152, 0.0722)) * HDR_SCALE);

    // cloudOcclusion, not raw hdrBlend.a: cloud opacity only hides terrain when the
    // camera is above the cloud layer, and cloudOcclusion already carries that test.
    // Below the layer there is no cloud between the eye and the ground, so coverage
    // comes from fog alone — which also keeps the eroded cloud gate (see
    // cloudsTemporal.wgsl) from raising terrain coverage in a band along ridges.
    let fogResult = vec4f(fogTonemapped, max(max(cloudOcclusion, fogFactor), rayCoverage));

    // Partial cloud occlusion: blend terrain fog with cloud-occluded sky view
    if (cloudOcclusion > 0.0) {
      let skyResult = vec4f(tonemapACES(HDR_SCALE * (hdrBlend.rgb + bloom.rgb + godRays)), 1.0);
      let blended = mix(fogResult, skyResult, cloudOcclusion);
      return vec4f(blended.rgb + flash + dither, blended.a);
    }

    return vec4f(fogResult.rgb + flash + dither, fogResult.a);
  }

  // Sky pixel: single ACES over the full HDR composite (sky + clouds + bloom).
  // Alpha is 1 — nothing is behind the sky. (This used to read hdrBlend.a, which
  // was 1 here only because the sky pass wrote alpha=1 on non-terrain pixels;
  // that channel now carries cloud opacity, so the constant is stated directly.)
  let tonemapped = tonemapACES(HDR_SCALE * (hdrBlend.rgb + bloom.rgb + godRays));
  return vec4f(tonemapped + flash + dither, 1.0);
}

fn worldFromScreenCoord( coord: vec2f, depthSample: f32 ) -> vec3f {
  let posClip = vec4f(coord.x * 2.0 - 1.0, (1.0 - coord.y) * 2.0 - 1.0, depthSample, 1.0);
  let posWordW = object.invViewProjectionMatrix * posClip;
  let posWorld = posWordW.xyz / posWordW.www;
  return posWorld;
}

// Triangular-PDF dither in units of one 8-bit level. Two independent uniform hashes
// summed give a triangular distribution, which is the right shape for quantisation
// noise: it decorrelates the error from the signal, so banding does not simply
// become a lower-contrast band. Static per pixel — a time-varying pattern would
// shimmer on a still camera, and the whole point here is a scene that barely moves.
fn triangularDither(pixel: vec2f) -> f32 {
    let n1 = fract(sin(dot(pixel, vec2f(12.9898, 78.233))) * 43758.5453);
    let n2 = fract(sin(dot(pixel, vec2f(93.9898, 67.345))) * 24634.6345);
    return (n1 + n2 - 1.0) / 255.0;
}

// https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
fn tonemapACES(x: vec3f) -> vec3f {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((x*(a*x+b))/(x*(c*x+d)+e), vec3f(0.0), vec3f(1.0));
}
