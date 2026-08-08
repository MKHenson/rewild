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

// Supplied by the pipeline (SkyQuality.ts). Both bound loops, so they have to be
// WGSL consts rather than uniforms — changing tier recompiles the module.
const NUM_CLOUD_SAMPLES = ${ CLOUD_SAMPLES };
const NUM_LIGHT_SAMPLES = ${ CLOUD_LIGHT_SAMPLES };

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
//   bloom          +/-21  (15 texels at BLOOM_SCALE 0.5) -- exceeds this margin, so
//                         it carries its own coverage weighting and must keep it
//   cloudsTemporal unbounded (reprojection drifts with camera rotation) -- likewise
//                         validity-checked in sampleHistoryValid()
//
// Note the probes below are axis-aligned only, so erosion along a diagonal is
// roughly this value over sqrt(2). Budget accordingly.
//
// Raising this is cheap insurance: it costs a thin band of extra marching along
// silhouettes, which is far less than per-tap depth loads in a full-screen filter.
//
// Supplied by the pipeline as (bilateral radius + margin) so the invariant above
// cannot be broken by tuning the bilateral alone — see GATE_MARGIN_TEXELS in
// SkyQuality.ts.
const GATE_EROSION_TEXELS: f32 = ${ GATE_EROSION_TEXELS };

// Standard deviations of its 3x3 neighbourhood a reprojected sample may sit from
// that neighbourhood's mean before it is clamped in. See historyNeighbourhood().
//
// The main dial on the clamp: lower pins reprojected texels harder to their
// surroundings, trading texel-scale cloud detail for fewer stale outliers. Above
// the textbook 1.0 because a 9-tap sigma is itself noisy, and under-estimating
// sigma clamps valid detail.
const NEIGHBOURHOOD_CLAMP_GAMMA: f32 = 1.25;

// Below this many valid taps the mean and sigma are not worth trusting, so the
// clamp is skipped rather than applied to a one- or two-sample estimate.
const NEIGHBOURHOOD_MIN_TAPS: f32 = 3.0;

// Ceiling on how much cloud animation may raise the EMA blend for a freshly
// marched pixel. Effective sample count is 1 / (blendFactor + this), so raising it
// cuts how much the sub-texel jitter can average — raise only if wind visibly lags.
const WIND_BLEND_BOOST_MAX: f32 = 0.12;

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
    jitter: vec2<f32>,                 // sub-texel march offset, in cloud texels, [-0.5, 0.5]
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
    nbSample = max(i32(mix(f32(nbSample), ${ CLOUD_LOD_SAMPLES }, lod)), ${ CLOUD_MIN_SAMPLES });

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
//
// Reconstruction is Catmull-Rom, not bilinear, which is what keeps clouds from
// dissolving while the camera turns. A turning camera reprojects exactly (w = 0
// drops the translation column, leaving only rotation) but refetches history at a
// new sub-texel offset every frame. A bilinear is an average, so iterating it walks
// the signal toward its local mean and the deck goes soft within a second of
// turning. Catmull-Rom's negative lobes do not converge that way.
//
// Raising the blend factor is not the fix for that smear — it discards history to
// hide a filter problem, and takes the jitter's accumulation depth with it.
// Catmull-Rom (B=0, C=0.5) weights for taps at offsets -1, 0, 1, 2 from `t`'s cell.
fn catmullRomWeights(t: f32) -> vec4f {
    let t2 = t * t;
    let t3 = t2 * t;
    return vec4f(
        -0.5 * t3 +       t2 - 0.5 * t,
         1.5 * t3 - 2.5 * t2       + 1.0,
        -1.5 * t3 + 2.0 * t2 + 0.5 * t,
         0.5 * t3 - 0.5 * t2
    );
}

fn sampleHistoryValid(uv: vec2f) -> HistorySample {
    let dims  = vec2f(textureDimensions(historyTexture));
    let coord = uv * dims - 0.5;
    let base  = floor(coord);
    let frac  = coord - base;
    let maxT  = vec2i(dims) - 1;
    let dDims = vec2f(textureDimensions(depthTexture));
    let maxD  = vec2i(dDims) - 1;

    // var rather than let: indexed by the loop counter below, and a memory
    // location is indexable with a runtime value on every backend.
    var crX = catmullRomWeights(frac.x);
    var crY = catmullRomWeights(frac.y);

    var crAcc    = vec4f(0.0);
    var allValid = true;

    var biAcc  = vec4f(0.0);
    var biWsum = 0.0;

    var lo = vec4f( 1e30);
    var hi = vec4f(-1e30);

    for (var j = 0; j < 4; j++) {
        for (var i = 0; i < 4; i++) {
            let texel   = clamp(vec2i(base) + vec2i(i - 1, j - 1), vec2i(0), maxT);
            let texelUV = (vec2f(texel) + 0.5) / dims;
            let dCoord  = vec2i(texelUV * dDims - 0.5);

            if (textureLoad(depthTexture, clamp(dCoord, vec2i(0), maxD), 0) < 1.0) {
                allValid = false;
                continue;
            }

            let c = textureLoad(historyTexture, texel, 0);
            crAcc += crX[i] * crY[j] * c;

            // Inner 2x2: the bilinear fallback, and the range the Catmull-Rom
            // result is confined to.
            if (i >= 1 && i <= 2 && j >= 1 && j <= 2) {
                let wx = select(1.0 - frac.x, frac.x, i == 2);
                let wy = select(1.0 - frac.y, frac.y, j == 2);
                biAcc  += wx * wy * c;
                biWsum += wx * wy;
                lo = min(lo, c);
                hi = max(hi, c);
            }
        }
    }

    var out: HistorySample;

    if (allValid) {
        // Confined to the inner 2x2's range: the negative lobes overshoot at a
        // step edge, which against HDR reads as a dark or blown ring. Costs
        // nothing of the point — a cubic still places the value within that range
        // rather than averaging toward the middle.
        out.valid = true;
        out.color = clamp(crAcc, lo, hi);
    } else {
        // A tap in the 4x4 was depth-gated. Catmull-Rom weights sum to 1 but
        // individual ones are negative, so dropping taps and renormalising is
        // unstable — the remainder can sum to near zero. The bilinear's weights
        // are non-negative and renormalise safely. Only reached along terrain
        // silhouettes, where the gate applies.
        out.valid = biWsum > 0.0;
        out.color = select(vec4f(0.0), biAcc / max(biWsum, 1e-6), out.valid);
    }

    return out;
}

struct Neighbourhood {
    mean: vec4f,
    stddev: vec4f,
    valid: bool,
};

// Mean and standard deviation of the 3x3 history neighbourhood around `uv`, over
// the taps the depth gate left valid. Used to bound reprojected texels.
//
// Only one checkerboard group marches per frame, so neighbouring texels hold values
// up to 3 frames apart in age. With the clouds animating those differ in value, and
// since the groups tile 2x2 the disagreement lands as 2x2 blocks that skyBlend's
// upsample magnifies into stair-stepping along cloud silhouettes. A 3x3 window
// spans all four groups, so the statistics cover every age present.
//
// `uv` MUST be the reprojected coordinate, not the fragment's own — the question is
// whether a texel disagrees with its own surroundings in history. Centring on the
// fragment instead clamps a correctly-reprojected sample toward whatever sky was at
// that screen position before the camera turned, smearing three quarters of the
// screen under rotation.
//
// These are history statistics, one frame stale, where textbook TAA uses the
// current frame's fresh render. There is none here: the march is inline in this
// pass and covers a quarter of the pixels.
fn historyNeighbourhood(uv: vec2f) -> Neighbourhood {
    let dims   = vec2f(textureDimensions(historyTexture));
    let centre = vec2i(uv * dims);
    let maxT   = vec2i(dims) - 1;
    let dDims = vec2f(textureDimensions(depthTexture));
    let maxD  = vec2i(dDims) - 1;

    // Running sum and sum of squares, for a one-pass mean/variance.
    var sum   = vec4f(0.0);
    var sumSq = vec4f(0.0);
    var taps  = 0.0;

    for (var j = -1; j <= 1; j++) {
        for (var i = -1; i <= 1; i++) {
            let texel = clamp(centre + vec2i(i, j), vec2i(0), maxT);

            // Gated texels are vec4f(0) — missing data, not black cloud. Folding
            // them in would drag the mean toward zero and inflate sigma, giving
            // every ridge a band of wrongly-clamped sky. textureLoad rather than
            // the comparison sampler: this wants occupancy, not PCF.
            let texelUV = (vec2f(texel) + 0.5) / dims;
            let dCoord  = vec2i(texelUV * dDims - 0.5);
            let depth   = textureLoad(depthTexture, clamp(dCoord, vec2i(0), maxD), 0);
            if (depth < 1.0) {
                continue;
            }

            let c = textureLoad(historyTexture, texel, 0);
            sum   += c;
            sumSq += c * c;
            taps  += 1.0;
        }
    }

    var out: Neighbourhood;
    out.valid = taps >= NEIGHBOURHOOD_MIN_TAPS;

    let inv = 1.0 / max(taps, 1.0);
    out.mean = sum * inv;
    // max() against zero: E[x^2] - E[x]^2 lands a hair below it in f32 on a
    // near-uniform neighbourhood, and sqrt of that is NaN.
    out.stddev = sqrt(max(sumSq * inv - out.mean * out.mean, vec4f(0.0)));
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

    // ── Sub-texel jitter for the march ray ──
    //
    // Offsetting the ray by a different sub-texel amount each frame turns the EMA
    // below into supersampling of the cloud silhouette. Marching every frame from
    // the texel centre instead only averages the along-ray dither, leaving the
    // silhouette a binary edge quantised to the cloud grid, which skyBlend's
    // upsample then magnifies into stair-stepping.
    //
    // Reconstructed from fragCoord rather than offsetting vRelPosition, which
    // carries no derivative to offset along. Exact, not an approximation: the
    // far-plane point is affine in NDC under a perspective projection, so this
    // matches the rasteriser and jitter = 0 reproduces vRelPosition.
    //
    // Only the march is jittered. `direction` stays on the texel centre for the
    // depth gate, the reprojection and the history read — a still camera must
    // reproject onto the exact texel it came from, or resampling history at a
    // half-texel offset every frame blurs the accumulation away.
    let jitteredNDC = vec2f(
        ((fragCoord.x + temporal.jitter.x) / cloudResolution.x) * 2.0 - 1.0,
        1.0 - ((fragCoord.y + temporal.jitter.y) / cloudResolution.y) * 2.0
    );
    let jitteredRel = object.invViewProjectionMatrix * vec4f(jitteredNDC, 1.0, 1.0);
    let marchDirection = normalize(jitteredRel.xyz / jitteredRel.w);

    // ── 4×4 checkerboard temporal group ──

    let pixelGroup = (i32(fragCoord.x) % 2) + (i32(fragCoord.y) % 2) * 2;
    let isThisPixelsTurn = pixelGroup == i32(temporal.currentSampleIndex);

    var pixelColor: vec4f;

    if (isThisPixelsTurn || temporal.historyValid == 0u) {
        // Fresh full-quality raymarch (always when history is invalid)
        pixelColor = drawCloudsHorizonFog(marchDirection, org, vSunDirection);
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
            // Bound it to what its surroundings support. Two things put a
            // reprojected sample out of step with its neighbours: up to 3 frames
            // of staleness, and reprojection treating the clouds as infinitely
            // distant, so translation drags in a sample with the wrong parallax
            // for a ~1.5km deck. Both read as a texel that disagrees with
            // everything around it.
            //
            // Per-channel against the AABB rather than clipping along the ray to
            // the mean: the ray form only pays off on saturated colour, which
            // clouds have little of. Alpha is clamped too — coverage disagreement
            // at a silhouette is most of the stair-stepping.
            let nb = historyNeighbourhood(prevUV);
            if (nb.valid) {
                let spread = NEIGHBOURHOOD_CLAMP_GAMMA * nb.stddev;
                pixelColor = clamp(
                    reprojected.color,
                    nb.mean - spread,
                    nb.mean + spread
                );
            } else {
                pixelColor = reprojected.color;
            }
        } else {
            // Off-screen, behind-camera, or reprojecting onto texels the previous
            // frame gated away — nothing trustworthy to read, so march instead.
            pixelColor = drawCloudsHorizonFogLowQuality(marchDirection, org, vSunDirection);
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

    var finalColor: vec4f;

    // history is fetched inside the fresh branch, not ahead of the chain: a
    // reprojected pixel takes pixelColor whether or not its co-located history is
    // valid, so on three quarters of the screen the gather cannot affect the output.
    //
    // Validity-aware, for the same reason as the reprojection above. blendFactor is
    // low (~0.1-0.15), so history carries ~90% of the result here — a contaminated
    // sample would drag an otherwise correct fresh march most of the way to black.
    if (temporal.historyValid == 0u) {
        finalColor = pixelColor;
    } else if (isThisPixelsTurn) {
        let historyColor = sampleHistoryValid(currentUV);
        if (!historyColor.valid) {
            finalColor = pixelColor;
        } else {
            // Boost the blend when the clouds are animating, so a fresh march is
            // not held back by history describing where the cloud used to be.
            //
            // This covers cloud animation only. Pixel-age disagreement is handled
            // by the neighbourhood clamp on the reprojected branch, and history
            // lagging a turning camera by MOVEMENT_RAMP_DEG — folding those into
            // this constant costs accumulation depth on a still camera, which is
            // what the sub-texel jitter needs to antialias with.
            let windBoost = clamp(object.windiness * 2.0, 0.0, WIND_BLEND_BOOST_MAX);
            let effectiveBlend = min(temporal.blendFactor + windBoost, 1.0);
            finalColor = mix(historyColor.color, pixelColor, effectiveBlend);
        }
    } else {
        finalColor = pixelColor;
    }

    output.color = finalColor;
    return output;
}
