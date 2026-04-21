// Temporal cloud rendering shader (Phase 5).
//
// This is a self-contained variant of clouds.wgsl.  It duplicates the raymarching
// helper functions (skyRay, lightRay, drawCloudsHorizonFog, etc.) so it can be
// built independently without pulling in clouds.wgsl.
//
// Build order for TemporalCloudRenderer:
//   cloudsTemporal.wgsl + skyConstants.wgsl + fog.wgsl + skyCommon.wgsl + cloudDensity.wgsl
//
// skyCommon.wgsl provides: ObjectStruct, VaryingsStruct, OutputStruct, hash/noise/fbm, @vertex fn vs()
// skyConstants.wgsl provides: EARTH_RADIUS, CLOUD_START, CLOUD_HEIGHT, SUN_POWER, FOG_*, etc.
// fog.wgsl provides: intersectSphere, intersectSphereBoth, getFogColor, getAtmosphereColor
// cloudDensity.wgsl provides: CloudDensityResult, cloudDensity()
//
// SYNC NOTE: if skyRay() or drawCloudsHorizonFog() change in clouds.wgsl, mirror the
// changes here.  The LOD system (calculateCloudLOD) must be kept identical.

const NUM_CLOUD_SAMPLES = 120;
const NUM_LIGHT_SAMPLES = 20;

// ──────────────────────────────────────────────
// Group 0: standard cloud shader bindings
// (identical to clouds.wgsl so the same SkyRenderer uniform buffer is reused)
// ──────────────────────────────────────────────

@group(0) @binding(0)
var<uniform> object: ObjectStruct;

@group(0) @binding(1)
var noiseSampler: sampler;

@group(0) @binding(2)
var noiseTexture: texture_2d<f32>;

@group(0) @binding(3)
var pebblesTexture: texture_2d<f32>;

@group(0) @binding(4)
var depthTexture: texture_depth_2d;

@group(0) @binding(5)
var depthSampler: sampler_comparison;

// ──────────────────────────────────────────────
// Group 1: temporal reprojection bindings
// ──────────────────────────────────────────────

struct TemporalUniforms {
    prevViewProjMatrix: mat4x4<f32>,  // previous frame's view-projection (for reprojection)
    currentSampleIndex: u32,           // which 1/16 group to refresh this frame (0-15)
    historyValid: u32,                 // 0 = history empty (first frame / after teleport)
    blendFactor: f32,                  // EMA weight for reprojected pixels (e.g. 0.15)
    _padding: f32,
};

@group(1) @binding(0)
var historyTexture: texture_2d<f32>;

@group(1) @binding(1)
var historySampler: sampler;

@group(1) @binding(2)
var<uniform> temporal: TemporalUniforms;

// ──────────────────────────────────────────────
// Module-level private state (mirrors clouds.wgsl)
// ──────────────────────────────────────────────

var<private> varyings: VaryingsStruct;
var<private> output: OutputStruct;
var<private> sunDotUp: f32;
var<private> currentFragCoord: vec2<f32>;

// ──────────────────────────────────────────────
// Dynamic LOD (identical to clouds.wgsl)
// ──────────────────────────────────────────────

fn calculateCloudLOD(fragCoord: vec2<f32>, dir: vec3<f32>, rayLength: f32) -> f32 {
    let screenSize = vec2<f32>(object.resolutionX * object.resolutionScale, object.resolutionY * object.resolutionScale);
    let screenCenter = screenSize * 0.5;
    let distFromCenter = length(fragCoord - screenCenter) / length(screenCenter);
    let screenLOD = smoothstep(0.3, 1.0, distFromCenter);
    let distanceLOD = smoothstep(1000.0, 5000.0, rayLength);
    let angleLOD = smoothstep(0.3, 0.0, abs(dir.y)) * 0.3;
    return max(screenLOD, max(distanceLOD, angleLOD));
}

// ──────────────────────────────────────────────
// Raymarching helpers (mirrors clouds.wgsl)
// ──────────────────────────────────────────────

fn numericalMieFit(costh: f32) -> f32 {
    let p0: f32 = 9.805233e-06;
    let p1: f32 = -65.0;
    let p2: f32 = -55.0;
    let p3: f32 = 0.8194068;
    let p4: f32 = 0.1388198;
    let p5: f32 = -83.70334;
    let p6: f32 = 7.810083;
    let p7: f32 = 0.002054747;
    let p8: f32 = 0.02600563;
    let p9: f32 = -4.552125e-12;

    let p1_intermediate: f32 = costh + p3;
    let expValues: vec4f = exp(vec4f(
        p1 * costh + p2,
        p5 * p1_intermediate * p1_intermediate,
        p6 * costh,
        p9 * costh
    ));
    let expValWeight: vec4f = vec4f(p0, p4, p7, p8);
    return dot(expValues, expValWeight);
}

fn clouds(position: vec3f) -> CloudDensityResult {
    return cloudDensity(position, object.windiness, object.cloudiness, object.iTime);
}

fn lightRay(rayStartPosition: vec3f, phaseFunction: f32, dC: f32, mu: f32, sun_direction: vec3f, cloudHeight2: f32) -> f32 {
    var rayStartPos = rayStartPosition;
    var nbSampleLight = NUM_LIGHT_SAMPLES;
    let zMaxl: f32 = 600.0;
    let stepL: f32 = zMaxl / f32(nbSampleLight);
    var lighRayDen: f32 = 0.0;
    rayStartPos += sun_direction * stepL * hash1(dot(rayStartPos, vec3f(12.256, 2.646, 6.356)) + object.iTime * 0.00001);
    var cloudHeight: f32 = 0.0;
    for (var j = 0; j < nbSampleLight; j++) {
        let result = clouds(rayStartPos + sun_direction * f32(j) * stepL);
        cloudHeight = result.cloudHeight;
        lighRayDen += result.density;
    }
    let sunAngle = dot(sun_direction, vec3f(0.0, 1.0, 0.0));
    let sunIntensityModifier = smoothstep(0.0, 0.1, sunAngle);
    let scatterAmount: f32 = mix(0.008, 1.0, smoothstep(0.96, 0.0, mu));
    let beersLaw: f32 = exp(-stepL * lighRayDen) + 0.5 * scatterAmount * exp(-0.1 * stepL * lighRayDen) + scatterAmount * 0.4 * exp(-0.02 * stepL * lighRayDen);
    return sunIntensityModifier * beersLaw * phaseFunction * mix(0.05 + 1.5 * pow(min(1.0, dC * 8.5), 0.3 + 5.5 * cloudHeight), 1.0, clamp(lighRayDen * 0.4, 0.0, 1.0));
}

fn skyRay(cameraPos: vec3f, dir: vec3f, sun_direction: vec3f) -> vec4f {
    const ATM_START: f32 = EARTH_RADIUS + CLOUD_START;
    const ATM_END: f32 = ATM_START + CLOUD_HEIGHT;

    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight = length(cameraPos - earthCenter);

    let hitInner = intersectSphereBoth(cameraPos, dir, earthCenter, ATM_START);
    let hitOuter = intersectSphereBoth(cameraPos, dir, earthCenter, ATM_END);

    var tStart: f32;
    var tEnd: f32;
    var isInsideClouds = false;

    if (camHeight < ATM_START) {
        if (!hitInner.hit) { return vec4f(0.0); }
        tStart = hitInner.tFar;
        tEnd = hitOuter.tFar;
    } else if (camHeight <= ATM_END) {
        isInsideClouds = true;
        tStart = 0.0;
        if (hitInner.hit && hitInner.tNear > 0.0) {
            tEnd = hitInner.tNear;
        } else {
            tEnd = hitOuter.tFar;
        }
        tEnd = min(tEnd, 2000.0);
    } else {
        if (!hitOuter.hit || hitOuter.tNear < 0.0) { return vec4f(0.0); }
        tStart = hitOuter.tNear;
        if (hitInner.hit && hitInner.tNear > 0.0) {
            tEnd = hitInner.tNear;
        } else {
            tEnd = hitOuter.tFar;
        }
    }

    if (tStart >= tEnd || tEnd <= 0.0) { return vec4f(0.0); }

    let hitEarth = intersectSphereBoth(cameraPos, dir, earthCenter, EARTH_RADIUS);
    if (hitEarth.hit && hitEarth.tNear > 0.0) {
        tEnd = min(tEnd, hitEarth.tNear);
        if (tStart >= tEnd) { return vec4f(0.0); }
    }

    let rayLength = tEnd - tStart;
    var nbSample = i32(f32(NUM_CLOUD_SAMPLES) * min(1.0, rayLength / 2000.0));
    if (isInsideClouds) {
        nbSample = i32(f32(nbSample) * 0.3);
    }
    nbSample = max(nbSample, 8);

    // Dynamic LOD: scale sample count by screen position, ray distance, and view angle
    let lod = calculateCloudLOD(currentFragCoord, dir, rayLength);
    nbSample = max(i32(mix(f32(nbSample), 40.0, lod)), 16);

    var color = vec3f(0.0);
    let stepS = rayLength / f32(nbSample);
    var rayStartPosition = cameraPos + tStart * dir;
    var transmittance = 1.0;
    let mu = dot(sun_direction, dir);
    let phaseFunction = numericalMieFit(mu);
    rayStartPosition += dir * stepS * hash1(dot(dir, vec3f(12.256, 2.646, 6.356)) + object.iTime * 0.00001);

    let sunDotUp3 = pow(sunDotUp, 3.0);

    for (var i = 0; i < nbSample; i++) {
        var cloudHeight: f32;
        let result = clouds(rayStartPosition);
        let density = result.density;
        cloudHeight = result.cloudHeight;

        if (density > 0.0) {
            let intensity = lightRay(rayStartPosition, phaseFunction, density, mu, sun_direction, cloudHeight);
            var cloudAmbientColor = mix(CLOUD_AMBIENT_NIGHT_COLOR, CLOUD_AMBIENT_EVENING_COLOR, smoothstep(-0.2, 0.2, sunDotUp));
            cloudAmbientColor = mix(cloudAmbientColor, CLOUD_AMBIENT_DAY_COLOR, smoothstep(0.2, 0.8, sunDotUp));
            let ambient = (0.5 + 0.6 * cloudHeight) * cloudAmbientColor * 6.5 + vec3f(0.8) * max(0.0, 1.0 - 2.0 * cloudHeight);
            var radiance = ambient + (SUN_POWER * intensity * mix(vec3f(0.8, 0.5, 0.3), vec3f(1.0), clamp(sunDotUp3, 0.0, 1.0)));
            radiance *= density;
            color += transmittance * (radiance - radiance * exp(-density * stepS)) / density;
            transmittance *= exp(-density * stepS);
            if (transmittance <= 0.05) { break; }
        }

        rayStartPosition += dir * stepS;
    }

    // Cirrus: blend high-altitude ice layer using remaining transmittance.
    if (transmittance > 0.05 && object.cirrusOpacity > 0.0) {
        let cir = cirrusRaySample(cameraPos, dir, sun_direction);
        if (cir.a > 0.0) {
            color += transmittance * cir.rgb * cir.a;
            transmittance *= (1.0 - cir.a);
        }
    }

    let background = getAtmosphereColor(sun_direction, dir, mu, vec3f(0.0));
    color += background * pow(transmittance, 2.0);

    let sunExtinction = smoothstep(-0.1, 0.1, sunDotUp);
    let airmass = 1.0 / max(sunDotUp, 0.04);
    let atmosphericDimming = exp(-0.15 * airmass);
    let sunDisc = 500.0 * smoothstep(0.9998, 1.0, mu) * sunExtinction * atmosphericDimming;
    color += vec3f(sunDisc) * pow(transmittance, 2.0);

    let sunAlpha = smoothstep(0.9995, 1.0, mu) * sunExtinction;
    let alpha = max(1.0 - transmittance, sunAlpha);
    return vec4f(color, alpha);
}

fn drawCloudsHorizonFog(dir: vec3f, org: vec3f, vSunDirection: vec3f) -> vec4f {
    var color = vec4f(0.0);
    color = skyRay(org, dir, vSunDirection);

    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight = length(org - earthCenter);
    const ATM_START_DCS = EARTH_RADIUS + CLOUD_START;

    if (camHeight >= ATM_START_DCS) {
        return color;
    }

    let fogDensity = mix(0.00001, 0.00009, object.foginess);
    let fogDistance = intersectSphere(org, dir, earthCenter, ATM_START_DCS);
    let cloudAlpha = min(exp(-fogDensity * fogDistance), color.a);
    return vec4f(getFogColor(dir, org, vSunDirection, color.rgb), cloudAlpha);
}

// Low-quality fallback for disoccluded pixels: same path as drawCloudsHorizonFog
// but forces maximum LOD so NUM_CLOUD_SAMPLES collapses to ~16.
fn drawCloudsHorizonFogLowQuality(dir: vec3f, org: vec3f, vSunDirection: vec3f) -> vec4f {
    let savedFragCoord = currentFragCoord;
    // Place fragCoord at the screen corner to guarantee LOD = 1.0
    let screenSize = vec2f(object.resolutionX * object.resolutionScale, object.resolutionY * object.resolutionScale);
    currentFragCoord = screenSize;
    let result = drawCloudsHorizonFog(dir, org, vSunDirection);
    currentFragCoord = savedFragCoord;
    return result;
}

// ──────────────────────────────────────────────
// Temporal fragment entry point
// ──────────────────────────────────────────────

@fragment
fn fs(
    @builtin(position) fragCoord: vec4<f32>,
    @location(0) vWorldPosition: vec3<f32>,
    @location(1) vSunDirection: vec3<f32>
) -> OutputStruct {
    sunDotUp = dot(vSunDirection, vec3f(0.0, 1.0, 0.0));
    currentFragCoord = fragCoord.xy;

    let direction = normalize(vWorldPosition - object.cameraPosition);

    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight = length(object.cameraPosition - earthCenter);
    let cloudResolution = vec2f(object.resolutionX * object.resolutionScale, object.resolutionY * object.resolutionScale);
    let currentUV = fragCoord.xy / cloudResolution;

    // ── Depth / hemisphere gates (same as standard clouds.wgsl) ──

    if (camHeight < (EARTH_RADIUS + CLOUD_START)) {
        let rawDepth = textureSampleCompare(depthTexture, depthSampler, currentUV, 1);
        if (rawDepth < 1.0) {
            output.color = vec4f(0.0, 0.0, 0.0, 0.0);
            return output;
        }
        let cosTheta = dot(direction, vec3f(0.0, 1.0, 0.0));
        let hemisphereMask = smoothstep(0.0, 0.1, cosTheta);
        if (hemisphereMask <= 0.0) {
            output.color = vec4f(0.0, 0.0, 0.0, 0.0);
            return output;
        }
    }

    // ── 4×4 checkerboard temporal group ──

    let pixelGroup = (i32(fragCoord.x) % 2) + (i32(fragCoord.y) % 2) * 2;
    let isThisPixelsTurn = pixelGroup == i32(temporal.currentSampleIndex);

    var pixelColor: vec4f;

    if (isThisPixelsTurn || temporal.historyValid == 0u) {
        // Fresh full-quality raymarch (always when history is invalid)
        pixelColor = drawCloudsHorizonFog(direction, object.cameraPosition, vSunDirection);
    } else {
        // Direction-based reprojection:
        // Project the current ray direction into the previous frame's screen space.
        // Using a far point (100 km) so camera translation is negligible (~0.1% error).
        let worldPoint = object.cameraPosition + direction * 100000.0;
        let prevClip = temporal.prevViewProjMatrix * vec4f(worldPoint, 1.0);

        var reprojectionValid = prevClip.w > 0.001;
        var prevUV: vec2f = vec2f(0.0);

        if (reprojectionValid) {
            let prevNDC = prevClip.xy / prevClip.w;
            // NDC [-1,1] y-up → texture UV [0,1] y-down
            prevUV = vec2f(prevNDC.x * 0.5 + 0.5, 0.5 - prevNDC.y * 0.5);
            if (any(prevUV < vec2f(0.001)) || any(prevUV > vec2f(0.999))) {
                reprojectionValid = false;
            }
        }

        if (reprojectionValid) {
            // textureSampleLevel (not textureSample) is required here because
            // control flow is non-uniform after the textureSampleCompare depth
            // test above.  Mip level 0 is correct — history is single-mip.
            pixelColor = textureSampleLevel(historyTexture, historySampler, prevUV, 0.0);
        } else {
            // Off-screen or behind-camera — low-quality fallback
            pixelColor = drawCloudsHorizonFogLowQuality(direction, object.cameraPosition, vSunDirection);
        }
    }

    // ── Exponential moving-average blend with history ──
    //
    // blendFactor = 1.0 when history is invalid (fast convergence on first frame).
    // blendFactor ≈ 0.15 during normal operation (stability over responsiveness).
    // For freshly-raymarched pixels (isThisPixelsTurn) we still go through the EMA
    // so that a pixel doesn't visibly pop every 16 frames when it gets refreshed.

    let blendFactor = select(temporal.blendFactor, 1.0, temporal.historyValid == 0u);
    // textureSampleLevel required (non-uniform control flow from depth test above).
    let historyColor = textureSampleLevel(historyTexture, historySampler, currentUV, 0.0);
    output.color = mix(historyColor, pixelColor, blendFactor);
    return output;
}
