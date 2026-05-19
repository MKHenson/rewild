// Cirrus cloud helpers — included in cloudsTemporal.wgsl and clouds.wgsl.
// No bindings or private vars here; all are declared in the host shader.
// Dependencies: fog.wgsl (intersectSphereBoth, SphereIntersect),
//               skyCommon.wgsl (noise3, ObjectStruct: cirrusCoverage/cirrusOpacity/windiness/iTime),
//               skyConstants.wgsl (EARTH_RADIUS).
// `sunDotUp` is read from the host shader's private var.

const CIRRUS_ALT:   f32 = 6000.0;
const CIRRUS_THICK: f32 = 50000.0;

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
    pos = m * pos * 2.02;
    f += 0.1250 * noise3(pos);
    pos = m * pos * 2.02;
    f += 0.0625 * noise3(pos);
    return f;
}

fn cirrusDensityAt(position: vec3f) -> f32 {
    let windDirection = vec3f(1.0, 0.0, -1.0);
    let windOffset  = vec3f(object.iTime * 0.00035 * object.windiness, 0.0, 0.0) * windDirection;
    let noisePos    = position * 0.0002 + windOffset;
    // Strongly elongated along the wind axis — 3x vs 1x creates strand-like shapes
    let stretchPos  = vec3f(noisePos.x * 0.35, noisePos.y * 8.0, noisePos.z * 1.0);

    // Domain warp: displace perpendicular to wind with a coarse noise field.
    // This tears the smooth blobs into fibrous tendrils.
    let warp = noise3(stretchPos * vec3f(0.35, 1.0, 0.9) + vec3f(3.7, 0.0, 1.9)) * 0.45;
    let warpedPos   = stretchPos + vec3f(0.0, 0.0, warp);

    let n           = fbm2(warpedPos);
    // threshold maps coverage [0,1] → [0.58, 0.10], landing in the bulk of the
    // fbm2 distribution so coverage=0.3 produces ~30 % sky coverage.
    let threshold   = 0.58 - object.cirrusCoverage * smoothstep(0, 0.5, object.cloudiness) * 0.48;
    // Wide ramp: 2.5x wider transition zone gives a broad soft feathering region
    let rawDensity  = clamp((n - threshold) / 0.30, 0.0, 1.0);
    // Squaring keeps the feathering zone nearly transparent — edges blend into sky
    return rawDensity * rawDensity;
}

fn cirrusLighting(sunDotDir: f32) -> vec3f {
    let dayFactor  = smoothstep(-0.1, 0.2, sunDotUp);
    let phase      = 0.5 + 0.5 * sunDotDir;
    let dayColor   = vec3f(0.9, 0.93, 1.0) * 70.0;
    let duskColor  = vec3f(1.0, 0.62, 0.32) * 50.0;
    let nightColor = vec3f(0.04, 0.05, 0.12) * 1.5;
    let dusk       = smoothstep(0.25, 0.0, sunDotUp) * smoothstep(-0.1, 0.08, sunDotUp);
    var col        = mix(nightColor, dayColor, dayFactor);
    col            = mix(col, duskColor, dusk);
    return col * (0.5 + 0.5 * phase);
}

// Returns (rgb=lit colour, a=opacity) for blending into skyRay() via remaining transmittance.
fn cirrusRaySample(cameraPos: vec3f, dir: vec3f, sunDirection: vec3f) -> vec4f {
    let earthCenter = vec3f(0.0, -EARTH_RADIUS, 0.0);
    let camHeight   = length(cameraPos - earthCenter);
    let mu          = dot(sunDirection, dir);

    const CIR_INNER: f32 = EARTH_RADIUS + CIRRUS_ALT;
    const CIR_OUTER: f32 = CIR_INNER + CIRRUS_THICK;
    const CIR_MID:   f32 = CIR_INNER + CIRRUS_THICK * 0.5;

    // Inside the layer: thin tint on the ice sheet itself.
    if (camHeight > CIR_INNER && camHeight < CIR_OUTER) {
        let d     = cirrusDensityAt(cameraPos);
        let alpha = clamp(d * 0.15, 0.0, 0.15);
        return vec4f(cirrusLighting(mu), alpha);
    }

    // Project ray onto the cirrus midplane sphere.
    let hitMid = intersectSphereBoth(cameraPos, dir, earthCenter, CIR_MID);
    if (!hitMid.hit) { return vec4f(0.0); }

    // Below midplane → tFar (exit up through sphere); above → tNear (enter down).
    let t = select(hitMid.tFar, hitMid.tNear, camHeight > CIR_MID);
    if (t <= 0.0) { return vec4f(0.0); }

    // Fade at very grazing angles to avoid horizon wrap-around.
    let cosAngle    = abs(dir.y);
    let horizonFade = smoothstep(0.0, 0.07, cosAngle);
    if (horizonFade <= 0.0) { return vec4f(0.0); }

    let worldPos = cameraPos + dir * t;
    let density  = cirrusDensityAt(worldPos);
    if (density <= 0.0) { return vec4f(0.0); }

    // Shallower angles traverse more layer thickness → more dense appearance.
    let angleFactor = clamp(1.0 / max(cosAngle, 0.07), 1.0, 6.0);
    let alpha       = clamp(
        density * object.cirrusOpacity * angleFactor * horizonFade,
        0.0,
        object.cirrusOpacity
    );
    return vec4f(cirrusLighting(mu), alpha);
}
