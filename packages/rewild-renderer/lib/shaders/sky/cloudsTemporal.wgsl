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

const NUM_CLOUD_SAMPLES = 80;
const NUM_LIGHT_SAMPLES = 25;

// The view march stops once this little light is still getting through — a pure
// perf cut-off, since the remaining contribution is negligible. It is *not* a
// statement that the cloud is 5% transparent, so the final opacity is rescaled
// against it (see the alpha computation in skyRay).
const CLOUD_TRANSMITTANCE_FLOOR: f32 = 0.05;

// How far the depth gate is pulled back from terrain silhouettes, in cloud texels.
//
// INVARIANT: this must exceed the filter radius of every consumer that reads this
// texture without a validity test of its own, or that consumer averages in the
// vec4f(0) the gate leaves behind and draws a dark outline along every ridge.
// Current consumers, converted to cloud texels (clouds run at 0.7x canvas):
//
//   skyBilateral   +/-4   (9x9 at cloud resolution; effective sigma is ~2)
//   skyBlend       +/-1   (bilinear footprint of the 0.7x -> 1.0x upsample)
//   skyBloom       +/-21  (15 texels at BLOOM_SCALE 0.5) -- exceeds this margin, so
//                         it carries its own coverage weighting and must keep it
//   cloudsTemporal unbounded (reprojection drifts with camera rotation) -- likewise
//                         validity-checked in sampleHistoryValid()
//
// Note the probes below are axis-aligned only, so erosion along a diagonal is
// roughly this value over sqrt(2). Budget accordingly.
//
// Raising this is cheap insurance: it costs a thin band of extra marching along
// silhouettes, which is far less than per-tap depth loads in a full-screen filter.
const GATE_EROSION_TEXELS: f32 = 6.0;

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

// Binding 1 was a linear sampler for the history texture. History is now fetched
// with textureLoad through sampleHistoryValid(), which does its own filtering so it
// can reject texels the previous frame depth-gated; a hardware linear fetch cannot
// be told to skip them. The binding is left vacant rather than renumbered.

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
    return cloudDensity(position, object.cameraPosition.xz, object.windiness, object.cloudiness, object.iTime, object.windDirection);
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

    // The cloud deck sits at 500-1100m, so it stays in direct sunlight for roughly a
    // degree *after* the sun has set for an observer on the ground — that geometry is
    // exactly why a cloud base lights up at sunrise and sunset. Gating the direct term
    // at sunAngle > 0 switched the sun off while it was still visibly on the horizon,
    // and only restored it at ~5.7 degrees up, so the clouds were lit by ambient alone
    // through the entire golden hour. The cutoff belongs just below zero, not above it.
    let horizonGate = smoothstep(-0.05, -0.005, sunAngle);

    // Grazing sunlight crosses far more atmosphere, so it should arrive dimmer and
    // warmer rather than simply stopping. Normalised so that above ~10 degrees this is
    // 1.0 and the daytime look is unchanged.
    let airmass = 1.0 / max(sunAngle, 0.02);
    let extinction = saturate(exp(-0.055 * (airmass - 5.75)));

    let sunIntensityModifier = horizonGate * extinction;
    let scatterAmount: f32 = mix(0.008, 1.0, smoothstep(0.96, 0.0, mu));
    let beersLaw: f32 = exp(-stepL * lighRayDen) + 0.9 * scatterAmount * exp(-0.1 * stepL * lighRayDen) + scatterAmount * 0.5 * exp(-0.02 * stepL * lighRayDen);
    // Thin cloud absorption: caps forward-scattered sun brightness for low-density clouds.
    // Low lighRayDen → 0.25 floor; thick clouds → 1.0 (unchanged). Tune 1.2 and 0.25.
    let thinCloudDim = mix(0.25, 1.0, 1.0 - exp(-lighRayDen * 1.2));
    return sunIntensityModifier * beersLaw * phaseFunction * mix(0.85 + 1.35 * pow(min(1.0, dC * 8.5), 0.3 + 5.5 * cloudHeight), 1.0, clamp(lighRayDen * 0.4, 0.0, 1.0)) * thinCloudDim;
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

    // pow() is undefined for a negative base in WGSL (it evaluates as
    // exp2(e2 * log2(e1))), and sunDotUp goes negative every night. Saturating first
    // keeps a NaN from reaching the radiance accumulator, where it would survive even
    // the multiply by a zeroed sun term.
    let sunDotUp3 = pow(saturate(sunDotUp), 3.0);

    for (var i = 0; i < nbSample; i++) {
        var cloudHeight: f32;
        let result = clouds(rayStartPosition);
        let density = result.density;
        cloudHeight = result.cloudHeight;

        if (density > 0.0) {
            let intensity = lightRay(rayStartPosition, phaseFunction, density, mu, sun_direction, cloudHeight);
            // The evening term now peaks at the horizon instead of ~11 degrees up, and
            // day takes over from ~6 to ~37 degrees. Previously evening only arrived at
            // the same elevation where day started displacing it, so the warm ambient
            // never actually got a window of its own.
            var cloudAmbientColor = mix(CLOUD_AMBIENT_NIGHT_COLOR, CLOUD_AMBIENT_EVENING_COLOR, smoothstep(-0.25, -0.02, sunDotUp));
            cloudAmbientColor = mix(cloudAmbientColor, CLOUD_AMBIENT_DAY_COLOR, smoothstep(0.1, 0.6, sunDotUp));
            let ambient = (0.5 + 0.6 * cloudHeight) * cloudAmbientColor * 6.5 + vec3f(0.8) * max(0.0, 1.0 - 2.0 * cloudHeight);
            var radiance = ambient + (SUN_POWER * intensity * mix(vec3f(0.8, 0.5, 0.3), vec3f(1.0), clamp(sunDotUp3, 0.0, 1.0)));
            radiance *= density;
            color += transmittance * (radiance - radiance * exp(-density * stepS)) / density;
            transmittance *= exp(-density * stepS);
            if (transmittance <= CLOUD_TRANSMITTANCE_FLOOR) { break; }
        }

        rayStartPosition += dir * stepS;
    }

    // Cirrus: blend high-altitude ice layer using remaining transmittance.
    if (transmittance > CLOUD_TRANSMITTANCE_FLOOR && object.cirrusOpacity > 0.0) {
        let cir = cirrusRaySample(cameraPos, dir, sun_direction);
        if (cir.a > 0.0) {
            color += transmittance * cir.rgb * cir.a;
            transmittance *= (1.0 - cir.a);
        }
    }

    let background = getAtmosphereColor(sun_direction, dir, mu, vec3f(0.0));
    color += background * pow(transmittance, 2.0);

    let sunExtinction = smoothstep(-0.12, 0.0, sunDotUp);
    let airmass = 1.0 / max(sunDotUp, 0.04);
    let atmosphericDimming = exp(-0.08 * airmass);
    // Sun disc grows near the horizon (lower threshold = larger angular radius).
    let horizonFactor = 1.0 - smoothstep(0.0, 0.2, sunDotUp);
    let discEdge  = mix(0.9998, 0.9990, horizonFactor);
    let alphaEdge = mix(0.9995, 0.9987, horizonFactor);
    let discBrightness = mix(1000.0, 9000.0, horizonFactor);
    let sunDisc = discBrightness * smoothstep(discEdge, 1.0, mu) * sunExtinction * atmosphericDimming;
    color += vec3f(sunDisc) * pow(transmittance, 2.0);

    let sunAlpha = smoothstep(alphaEdge, 1.0, mu) * sunExtinction;

    // Rescale against the march's cut-off so a fully-marched cloud reaches true
    // opacity. Raw 1 - transmittance topped out at 0.95, leaving even solid overcast
    // 5% transparent. That is invisible against sky, but stars run to hundreds of HDR
    // and skyBlend caps the sky it composites at 60, so the leak was a fixed ~3 HDR —
    // about three times a night cloud's own ambient radiance, which is why stars read
    // as shining straight through the deck. Dividing keeps the ramp smooth rather
    // than clamping at a hard edge.
    let cloudOpacity = saturate((1.0 - transmittance) / (1.0 - CLOUD_TRANSMITTANCE_FLOOR));
    let alpha = max(cloudOpacity, sunAlpha);
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

    let fogDistance = intersectSphere(org, dir, earthCenter, ATM_START_DCS);

    // Coverage is the cloud's own opacity. Fog between the camera and the cloud layer
    // changes the cloud's *colour*, which getFogColor below already does — it must not
    // reduce how much of the background the cloud hides.
    //
    // This used to be min(fogTransmittance, color.a), which mixes a transmittance
    // (1 = clear air) with an opacity, so the two run in opposite directions. Near the
    // horizon a ray only reaches the 500m cloud shell after ~79km of atmosphere, so
    // even at foginess = 0 transmittance is ~0.21 — and cloud alpha was being clamped
    // to 0.21 with it. The dark cloud colour still looked dark over a dark night sky,
    // which hid the problem, but ~79% of the starfield came through solid overcast.
    let cloudAlpha = color.a;
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

struct HistorySample {
    color: vec4f,
    valid: bool,
};

// History holds vec4f(0) wherever the previous frame depth-gated, so a linear fetch
// interpolates those zeros into neighbouring sky pixels — the same failure the
// upsample in skyBlend.wgsl had, moved into the temporal domain. Because only one
// checkerboard group reprojects per frame, the contamination lands on part of a
// silhouette at a time and reads as a *dashed* outline rather than a solid one.
// Gather the four texels and renormalise over the valid ones.
//
// Validity is tested against the current depth buffer rather than the previous
// frame's, which is not kept. Silhouettes move slowly relative to frame rate so it
// is a close stand-in, and erring toward rejection only costs a fresh march.
fn sampleHistoryValid(uv: vec2f) -> HistorySample {
    let dims  = vec2f(textureDimensions(historyTexture));
    let coord = uv * dims - 0.5;
    let base  = floor(coord);
    let frac  = coord - base;
    let maxT  = vec2i(dims) - 1;

    var acc  = vec4f(0.0);
    var wsum = 0.0;

    for (var j = 0; j < 2; j++) {
        for (var i = 0; i < 2; i++) {
            let texel   = clamp(vec2i(base) + vec2i(i, j), vec2i(0), maxT);
            let texelUV = (vec2f(texel) + 0.5) / dims;
            let wx      = select(1.0 - frac.x, frac.x, i == 1);
            let wy      = select(1.0 - frac.y, frac.y, j == 1);

            // textureSampleCompareLevel, not textureSampleCompare: this runs under
            // non-uniform control flow and must not need implicit derivatives.
            let sky = textureSampleCompareLevel(depthTexture, depthSampler, texelUV, 1.0);
            let w   = wx * wy * select(0.0, 1.0, sky >= 1.0);

            acc  += w * textureLoad(historyTexture, texel, 0);
            wsum += w;
        }
    }

    var out: HistorySample;
    out.valid = wsum > 0.0;
    out.color = select(vec4f(0.0), acc / max(wsum, 1e-6), out.valid);
    return out;
}

// ──────────────────────────────────────────────
// Temporal fragment entry point
// ──────────────────────────────────────────────

@fragment
fn fs(
    @builtin(position) fragCoord: vec4<f32>,
    @location(0) vRelPosition: vec3<f32>,
    @location(1) vSunDirection: vec3<f32>
) -> OutputStruct {
    sunDotUp = dot(vSunDirection, vec3f(0.0, 1.0, 0.0));
    currentFragCoord = fragCoord.xy;

    // vRelPosition is camera-relative, so the camera is at its origin.
    let direction = normalize(vRelPosition);

    // Camera-relative origin (camera at XZ = 0): the spherical-earth model is
    // evaluated with the sphere directly under the camera, making the sky
    // translation-invariant. Using the absolute world position made the camera
    // slowly climb the origin-centred sphere (~d²/2R — 200 m up at 50 km out)
    // until it entered the cloud shell and the sky stretched and broke. World
    // XZ is re-applied inside cloudDensity() for noise sampling only, so the
    // cloud pattern stays anchored to the world.
    let org = vec3f(0.0, object.cameraPosition.y, 0.0);
    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight = length(org - earthCenter);
    let cloudResolution = vec2f(object.resolutionX * object.resolutionScale, object.resolutionY * object.resolutionScale);
    let currentUV = fragCoord.xy / cloudResolution;

    // ── Depth / hemisphere gates (same as standard clouds.wgsl) ──

    if (camHeight < (EARTH_RADIUS + CLOUD_START)) {
        // Skip the march only where the surrounding neighbourhood is terrain too.
        //
        // This gate is a pure optimisation: the texels it skips sit behind terrain
        // and skyComposite discards them via its own depth test. But it writes
        // vec4f(0), and every consumer of this texture *filters* it — the bilateral,
        // skyBlend's 0.7x upsample, bloom's Gaussian, the temporal reprojection —
        // reading texels around the one being produced. textureSampleCompare is
        // PCF-filtered, so gating on it alone also eats a texel or two of genuine sky
        // past the silhouette. Between the two, pixels near a ridge had no valid
        // cloud data within reach and resolved toward black: a dark outline tracing
        // the terrain that no amount of validity-aware filtering downstream could
        // repair, because the data was never marched in the first place.
        //
        // Taking the max means one fully-sky tap is enough to keep marching, so the
        // dead zone erodes back from every silhouette by GATE_EROSION_TEXELS.
        let gateOffset = GATE_EROSION_TEXELS / cloudResolution;
        var neighbourhoodSky = textureSampleCompare(depthTexture, depthSampler, currentUV, 1);
        neighbourhoodSky = max(neighbourhoodSky,
            textureSampleCompare(depthTexture, depthSampler, currentUV + vec2f(gateOffset.x, 0.0), 1));
        neighbourhoodSky = max(neighbourhoodSky,
            textureSampleCompare(depthTexture, depthSampler, currentUV - vec2f(gateOffset.x, 0.0), 1));
        neighbourhoodSky = max(neighbourhoodSky,
            textureSampleCompare(depthTexture, depthSampler, currentUV + vec2f(0.0, gateOffset.y), 1));
        neighbourhoodSky = max(neighbourhoodSky,
            textureSampleCompare(depthTexture, depthSampler, currentUV - vec2f(0.0, gateOffset.y), 1));

        if (neighbourhoodSky < 1.0) {
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
        pixelColor = drawCloudsHorizonFog(direction, org, vSunDirection);
    } else {
        // Direction-based reprojection:
        // Project the current ray direction into the previous frame's screen
        // space as a point at infinity (w = 0). Camera translation cancels
        // exactly, so this stays precise at any distance from world origin —
        // the previous camPos + dir·100km formulation jittered far from origin
        // because the huge f32 coordinates lost sub-pixel precision.
        let prevClip = temporal.prevViewProjMatrix * vec4f(direction, 0.0);

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

        var reprojected: HistorySample;
        reprojected.valid = false;
        if (reprojectionValid) {
            reprojected = sampleHistoryValid(prevUV);
        }

        if (reprojected.valid) {
            pixelColor = reprojected.color;
        } else {
            // Off-screen, behind-camera, or reprojecting onto texels the previous
            // frame gated away — nothing trustworthy to read, so march instead.
            pixelColor = drawCloudsHorizonFogLowQuality(direction, org, vSunDirection);
        }
    }

    // ── Exponential moving-average blend with history ──
    //
    //  • historyValid == 0: first frame / after teleport — use fresh value directly.
    //
    //  • Fresh (isThisPixelsTurn): blend toward history at blendFactor.
    //    blendFactor is adaptive (TS side): low when camera is still (~0.1, many
    //    frames averaged → less noise), high when rotating (~0.6, fast convergence
    //    → no smear).
    //
    //  • Reprojected: the reprojected sample IS already temporally accumulated
    //    history — use it directly.  Mixing it with stale currentUV history was
    //    the cause of the smearing artefact on camera movement.

    // Validity-aware, for the same reason as the reprojection above. blendFactor is
    // low (~0.1-0.15), so history carries ~90% of the result here — a contaminated
    // sample would drag an otherwise correct fresh march most of the way to black.
    let historyColor = sampleHistoryValid(currentUV);
    var finalColor: vec4f;

    if (temporal.historyValid == 0u || !historyColor.valid) {
        finalColor = pixelColor;
    } else if (isThisPixelsTurn) {
        // Boost blend when clouds are animating so fresh raymarches converge faster,
        // preventing pixel-age differences from showing as static-camera smear.
        let windBoost = clamp(object.windiness * 2.0, 0.0, 0.4);
        let effectiveBlend = min(temporal.blendFactor + windBoost, 1.0);
        finalColor = mix(historyColor.color, pixelColor, effectiveBlend);
    } else {
        finalColor = pixelColor;
    }

    output.color = finalColor;
    return output;
}
