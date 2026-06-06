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
    shadowWorldSize: f32,
    shadowIntensity: f32,
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
var cloudShadowMap: texture_2d<f32>;

@group(0) @binding(5)
var godRaysTexture: texture_2d<f32>;

@group(0) @binding(6)
var bloomHighlights: texture_2d<f32>;

var<private> sunDotUp: f32;


@fragment fn fs(
  @builtin(position) fragCoord: vec4<f32>,
  ) -> @location(0) vec4f {
  // Define uv based on fragCoord
  let uv = fragCoord.xy / vec2(object.resolution);

  // Sample god rays — additively blended into every output path
  let godRays = textureSampleLevel(godRaysTexture, cloudsSampler, uv, 0);

  // Lightning screen flash: brightest at centre, dimmed at edges
  let flashVignette = 1.0 - smoothstep(0.3, 1.0, length(uv - vec2<f32>(0.5, 0.5)));
  let flash = object.lightningFlash * 0.7 * (0.6 + flashVignette * 0.4);

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
      // Terrain fully occluded by clouds — tonemap and use sky+cloud view directly
      let occludedColor = tonemapACES(HDR_SCALE * (hdrBlend.rgb + bloom.rgb)) + godRays.rgb + flash;
      return vec4f(occludedColor, 1.0);
    }

    let startHeigh = -160.0;
    let endHeight = mix(2.0, 50.0, object.foginess);
    let startDistance = mix( 200.0, 0.0, object.foginess );
    let endDistance = mix( 800.0, 300.0, object.foginess );

    // Height based fog
    let t = saturate( (worldPos.y - startHeigh) / (endHeight - startHeigh) );
    let heightFogFactor = 1.0 - pow( t, 3.0 );

    // Distance based fog
    let distance = length(worldPos - object.cameraPosition);
    let distanceFogFactor = saturate( (distance - startDistance) / (endDistance - startDistance) );

    // Adjust blending based on fog factors
    let fogFactor = saturate( distanceFogFactor + ( heightFogFactor * smoothstep( 0.0, 0.3, saturate( distance / endDistance ) ) ) );

    let dir: vec3f = normalize( worldPos - object.cameraPosition );
    let sunDirection: vec3f = normalize( object.sunPosition );

    sunDotUp = dot(sunDirection, vec3f(0.0, 1.0, 0.0));

    // Sample cloud shadow to darken fog under clouds
    let shadowUV = vec2f(
      (worldPos.x - object.cameraPosition.x) / object.shadowWorldSize + 0.5,
      (worldPos.z - object.cameraPosition.z) / object.shadowWorldSize + 0.5
    );
    var fogShadowFactor = 1.0;
    if (shadowUV.x >= 0.0 && shadowUV.x <= 1.0 && shadowUV.y >= 0.0 && shadowUV.y <= 1.0) {
      let edgeFade = smoothstep(0.0, 0.05, shadowUV.x) * smoothstep(1.0, 0.95, shadowUV.x)
                   * smoothstep(0.0, 0.05, shadowUV.y) * smoothstep(1.0, 0.95, shadowUV.y);
      let shadowDensity = textureSampleLevel(cloudShadowMap, cloudsSampler, shadowUV, 0.0).r;
      fogShadowFactor = 1.0 - (shadowDensity * object.shadowIntensity * edgeFade);
      fogShadowFactor = max(fogShadowFactor, 0.3);
    }

    // getFogColor uses intersectSphere against the cloud-base sphere. When the
    // camera is at or above that sphere, the forward intersection distance is
    // near-zero (the camera just crossed the sphere surface). Because fog density
    // is calibrated for tens-of-km scale, exp(-density * ~0) ≈ 1 and originalColor
    // (which is 0 — sky is transparent over terrain pixels above the cloud layer)
    // dominates the mix, producing solid-black terrain.
    // Fix: above CLOUD_START, build the fog colour directly from time-of-day
    // constants — the same values getFogColor would return at infinite fogDistance.
    var rawFogColor: vec3f;
    let cameraAlt = object.cameraPosition.y;
    if (cameraAlt >= CLOUD_START) {
        var fc = mix(FOG_COLOR_NIGHT, FOG_COLOR_EVENING, smoothstep(-0.1, 0.0, sunDotUp));
        fc = mix(fc, FOG_COLOR_DAY, smoothstep(0.0, 0.3, sunDotUp));
        let stormFactor = saturate((object.cloudiness - 0.8) / 0.2);
        fc = mix(fc, FOG_COLOR_STORM, stormFactor);
        let cloudOcc = mix(1.0, 0.05, pow(object.cloudiness, 2.0));
        let brightness = mix(0.01, 1.0, smoothstep(-0.1, 0.1, sunDotUp) * cloudOcc);
        rawFogColor = fc * brightness * 10.0;
    } else {
        rawFogColor = getFogColor( dir, object.cameraPosition, sunDirection, hdrBlend.rgb );
    }

    // Single ACES pass over the full HDR fog value — no separate exp curve.
    let fogTonemapped = tonemapACES(HDR_SCALE * rawFogColor * mix(1.0, fogShadowFactor, fogFactor));
    let fogResult = vec4f(fogTonemapped, max(hdrBlend.a, fogFactor));

    // Partial cloud occlusion: blend terrain fog with cloud-occluded sky view
    if (cloudOcclusion > 0.0) {
      let skyResult = vec4f(tonemapACES(HDR_SCALE * (hdrBlend.rgb + bloom.rgb)), 1.0);
      let blended = mix(fogResult, skyResult, cloudOcclusion);
      return vec4f(blended.rgb + godRays.rgb + flash, blended.a);
    }

    return vec4f(fogResult.rgb + godRays.rgb + flash, fogResult.a);
  }

  // Sky pixel: single ACES over the full HDR composite (sky + clouds + bloom)
  let tonemapped = tonemapACES(HDR_SCALE * (hdrBlend.rgb + bloom.rgb));
  return vec4f(tonemapped + godRays.rgb + flash, hdrBlend.a);
}

fn worldFromScreenCoord( coord: vec2f, depthSample: f32 ) -> vec3f {
  let posClip = vec4f(coord.x * 2.0 - 1.0, (1.0 - coord.y) * 2.0 - 1.0, depthSample, 1.0);
  let posWordW = object.invViewProjectionMatrix * posClip;
  let posWorld = posWordW.xyz / posWordW.www;
  return posWorld;
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
