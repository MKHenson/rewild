// Atmosphere composite. Blends sky, clouds, fog and god rays over the HDR scene
// target and outputs HDR radiance — no tone mapping, no dither, no lightning
// flash. Those happen in tonemap.wgsl.
//
// The pass composites with src-alpha hardware blending, so the alpha it returns
// is atmospheric coverage: `dst = fog * a + scene * (1 - a)`.
//
// Exposure only survives here as the scale for the ray-coverage heuristic below,
// which reasons about how bright a shaft will read *after* exposure. It comes in
// as `object.exposure` — the same `Camera.exposure` the tonemap uses, rather
// than a constant mirrored between the two, so turning the exposure knob cannot
// silently desync god-ray coverage from the image it is predicting.

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
    exposure: f32,
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

  // Convert uv to texture coordinates
  let texCoord = vec2<i32>(uv * vec2<f32>(textureDimensions(depthTexture)));

  // Load the depth value directly
  let rawDepth = textureLoad(depthTexture, texCoord, 0);

  // The HDR composite (sky + clouds pre-blended by the blend sub-pass). Bloom is
  // no longer added here — it is generated from the fully composited HDR frame
  // and folded in by the tonemap pass, so it now covers the whole scene rather
  // than only sky and clouds.
  let hdrBlend = textureSampleLevel(intermediateHDR, cloudsSampler, uv, 0);

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
      // Terrain fully occluded by clouds — use the sky+cloud view directly.
      // What is visible here is sky, so the shafts apply at full strength.
      return vec4f(hdrBlend.rgb + godRays, 1.0);
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

    // HDR fog radiance. Previously tonemapped here, which meant tonemapped fog
    // was alpha-blended over untonemapped terrain; now both sides of the blend
    // are HDR and the single tonemap runs afterwards over the result.
    let fogRadiance = rawFogColor + godRaysTerrain;

    // This pass composites over the already-shaded terrain with src-alpha, so colour
    // added here is scaled by the coverage term on the way out. A shaft is medium
    // radiance sitting in front of the terrain, so it has to raise coverage as well —
    // otherwise the near-zero clear-air fogFactor multiplies it straight back out.
    let rayCoverage = saturate(dot(godRaysTerrain, vec3f(0.2126, 0.7152, 0.0722)) * object.exposure);

    // cloudOcclusion, not raw hdrBlend.a: cloud opacity only hides terrain when the
    // camera is above the cloud layer, and cloudOcclusion already carries that test.
    // Below the layer there is no cloud between the eye and the ground, so coverage
    // comes from fog alone — which also keeps the eroded cloud gate (see
    // cloudsTemporal.wgsl) from raising terrain coverage in a band along ridges.
    let fogResult = vec4f(fogRadiance, max(max(cloudOcclusion, fogFactor), rayCoverage));

    // Partial cloud occlusion: blend terrain fog with cloud-occluded sky view
    if (cloudOcclusion > 0.0) {
      let skyResult = vec4f(hdrBlend.rgb + godRays, 1.0);
      return mix(fogResult, skyResult, cloudOcclusion);
    }

    return fogResult;
  }

  // Sky pixel: the full HDR composite (sky + clouds + shafts). Alpha is 1 —
  // nothing is behind the sky. (This used to read hdrBlend.a, which was 1 here
  // only because the sky pass wrote alpha=1 on non-terrain pixels; that channel
  // now carries cloud opacity, so the constant is stated directly.)
  return vec4f(hdrBlend.rgb + godRays, 1.0);
}

fn worldFromScreenCoord( coord: vec2f, depthSample: f32 ) -> vec3f {
  let posClip = vec4f(coord.x * 2.0 - 1.0, (1.0 - coord.y) * 2.0 - 1.0, depthSample, 1.0);
  let posWordW = object.invViewProjectionMatrix * posClip;
  let posWorld = posWordW.xyz / posWordW.www;
  return posWorld;
}

// tonemapACES and triangularDither moved to tonemap.wgsl, which now owns
// the single whole-frame tone curve and the 8-bit quantisation dither.
