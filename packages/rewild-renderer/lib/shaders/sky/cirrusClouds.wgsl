// Cirrus cloud constants (high-altitude ice-crystal layer, 6-8 km)
const CIRRUS_START: f32 = 6000.0;
const CIRRUS_HEIGHT: f32 = 2000.0;

struct CirrusUniformStruct {
    coverage:        f32, // 0-1, fraction of sky covered by cirrus
    windSpeed:       f32, // multiplier on wind animation speed
    opacity:         f32, // 0-1, master transparency
    resolutionScale: f32, // render target scale relative to canvas (e.g. 0.5)
};

@group(0) @binding(0)
var<uniform> object: ObjectStruct;

@group(0) @binding(1)
var noiseSampler: sampler;

@group(0) @binding(2)
var noiseTexture: texture_2d<f32>;

@group(0) @binding(3)
var<uniform> cirrusUniforms: CirrusUniformStruct;

@group(0) @binding(4)
var depthTexture: texture_depth_2d;

@group(0) @binding(5)
var depthSampler: sampler_comparison;

// Required by skyCommon.wgsl's @vertex fn vs() and fog.wgsl helpers
var<private> varyings: VaryingsStruct;
var<private> sunDotUp: f32;

// 2-octave FBM — fewer octaves than cumulus for smoother, less-detailed noise.
fn fbm2(p: vec3f) -> f32 {
    let m = mat3x3<f32>(
         0.00,  0.80,  0.60,
        -0.80,  0.36, -0.48,
        -0.60, -0.48,  0.64
    );
    var pos = p;
    var f = 0.5000 * noise3(pos);
    pos = m * pos * 2.02;
    f += 0.2500 * noise3(pos);
    return f;
}

// Returns a [0,1] cloud presence value at a world-space position.
// Sampling is done at the projected world-space point, not along a ray.
fn cirrusDensityAt(position: vec3f) -> f32 {
    let windOffset = vec3f(object.iTime * 0.00015 * cirrusUniforms.windSpeed, 0.0, 0.0);
    // 0.0002 scale → features ~5 km wide in world space — coarse enough to see clearly
    let noisePos = position * 0.0002 + windOffset;

    // Strong X stretch creates elongated east-west streaks typical of cirrus.
    // Near-zero Y stretch keeps the sampling horizontal (thin 2-D sheet).
    let stretchedPos = vec3f(noisePos.x * 4.0, noisePos.y * 0.05, noisePos.z * 1.5);

    let n = fbm2(stretchedPos);

    // fbm2 returns values in roughly [0, 0.75] with a bell distribution
    // centred around 0.35-0.40.  Using (1 - coverage) as the threshold pushes
    // it into the extreme tail (< 5 % of samples) which is why only 3-4 dots
    // appeared.  Map coverage [0,1] onto [0.58, 0.10] so that coverage=0.3
    // gives threshold ≈ 0.41, landing near the upper half of the distribution
    // and producing ~30-40 % sky coverage as the name implies.
    let threshold = 0.58 - cirrusUniforms.coverage * 0.48;

    // Soft ramp above threshold → smooth, feathered cloud edges
    return clamp((n - threshold) / 0.12, 0.0, 1.0);
}

// Lighting for ice-crystal cirrus. Cirrus appears as white/grey wisps in
// daylight, warm orange at sunrise/sunset, and nearly invisible at night.
// Uses sky-appropriate HDR scale (~40-80), NOT the cumulus SUN_POWER (1200).
fn cirrusLighting(sunDotDir: f32) -> vec3f {
    // dayFactor: 0=night, 1=full day
    let dayFactor = smoothstep(-0.1, 0.2, sunDotUp);

    // Forward-scattering phase: ice crystals scatter more forward than water droplets
    let phase = 0.5 + 0.5 * sunDotDir;

    // Cloud colour palette
    let dayColor   = vec3f(0.9, 0.93, 1.0) * 70.0;  // blue-white midday
    let duskColor  = vec3f(1.0, 0.62, 0.32) * 50.0;  // warm orange at horizon
    let nightColor = vec3f(0.04, 0.05, 0.12) * 1.5;   // faint moonlit blue

    // Dusk: peaks when sun is near horizon (sunDotUp ≈ 0.0–0.15)
    let dusk = smoothstep(0.25, 0.0, sunDotUp) * smoothstep(-0.1, 0.08, sunDotUp);

    var color = mix(nightColor, dayColor, dayFactor);
    color = mix(color, duskColor, dusk);

    return color * (0.5 + 0.5 * phase);
}

// Projection-based cirrus: find where the ray hits the cirrus layer midplane
// and sample noise there. This is more appropriate than volumetric marching
// for a thin, near-2D ice-crystal sheet.
fn cirrusRay(cameraPos: vec3f, dir: vec3f, sunDirection: vec3f) -> vec4f {
    const CIR_INNER: f32 = EARTH_RADIUS + CIRRUS_START;
    const CIR_OUTER: f32 = CIR_INNER + CIRRUS_HEIGHT;
    const CIR_MID:   f32 = CIR_INNER + CIRRUS_HEIGHT * 0.5;

    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight   = length(cameraPos - earthCenter);
    let mu          = dot(sunDirection, dir);

    // Inside the cirrus layer: apply a thin atmospheric tint
    if (camHeight > CIR_INNER && camHeight < CIR_OUTER) {
        let d     = cirrusDensityAt(cameraPos);
        let alpha = clamp(d * 0.15, 0.0, 0.15);
        return vec4f(cirrusLighting(mu), alpha);
    }

    // Project ray onto the cirrus midplane sphere
    let hitMid = intersectSphereBoth(cameraPos, dir, earthCenter, CIR_MID);
    if (!hitMid.hit) { return vec4f(0.0); }

    // Below midplane → use tFar (ray exits upward through sphere)
    // Above midplane → use tNear (ray enters downward into sphere)
    let t = select(hitMid.tFar, hitMid.tNear, camHeight > CIR_MID);
    if (t <= 0.0) { return vec4f(0.0); }

    // Fade at very grazing angles to avoid horizon wrap-around artifacts
    let cosAngle    = abs(dir.y);
    let horizonFade = smoothstep(0.0, 0.07, cosAngle);
    if (horizonFade <= 0.0) { return vec4f(0.0); }

    let worldPos = cameraPos + dir * t;
    let density  = cirrusDensityAt(worldPos);
    if (density <= 0.0) { return vec4f(0.0); }

    // At shallower view angles the ray traverses more layer thickness, making
    // cirrus appear denser — cap the angle boost to avoid infinite brightening.
    let angleFactor = clamp(1.0 / max(cosAngle, 0.07), 1.0, 6.0);
    let alpha       = clamp(
        density * cirrusUniforms.opacity * angleFactor * horizonFade,
        0.0,
        cirrusUniforms.opacity
    );

    return vec4f(cirrusLighting(mu), alpha);
}

@fragment
fn fs(
    @builtin(position) fragCoord: vec4f,
    @location(0) vWorldPosition: vec3f,
    @location(1) vSunDirection: vec3f,
) -> @location(0) vec4f {
    sunDotUp = dot(vSunDirection, vec3f(0.0, 1.0, 0.0));

    let direction = normalize(vWorldPosition - object.cameraPosition);

    // UV in render-target space (0-1) for depth test
    let uv = fragCoord.xy / vec2f(
        object.resolutionX * cirrusUniforms.resolutionScale,
        object.resolutionY * cirrusUniforms.resolutionScale
    );

    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight   = length(object.cameraPosition - earthCenter);
    const CIR_INNER_FS: f32 = EARTH_RADIUS + CIRRUS_START;

    // When below the cirrus layer apply depth and hemisphere guards,
    // same as the cumulus pass — skip pixels occluded by geometry.
    if (camHeight < CIR_INNER_FS) {
        let rawDepth = textureSampleCompare(depthTexture, depthSampler, uv, 1);
        if (rawDepth < 1.0) {
            return vec4f(0.0);
        }
        let cosTheta = dot(direction, vec3f(0.0, 1.0, 0.0));
        if (smoothstep(0.0, 0.1, cosTheta) <= 0.0) {
            return vec4f(0.0);
        }
    }

    return cirrusRay(object.cameraPosition, direction, vSunDirection);
}
