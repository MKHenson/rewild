struct PrecipUniforms {
    windDirection: vec2<f32>,  // offset  0
    windSpeed:     f32,        // offset  8
    gustStrength:  f32,        // offset 12
    precipitation: f32,        // offset 16
    temperature:   f32,        // offset 20
    shelterAmount: f32,        // offset 24
    iTime:         f32,        // offset 28  (seconds)
    resolutionX:   f32,        // offset 32
    resolutionY:   f32,        // offset 36
    cameraXZ:      vec2<f32>,  // offset 40 — world XZ for drop anchoring
};

@group(0) @binding(0) var<uniform> uniforms: PrecipUniforms;
@group(0) @binding(1) var depthTexture: texture_depth_2d;

// Returns a 2D random vector in [0,1]² for a given cell coordinate.
fn precipHash2(p: vec2f) -> vec2f {
    let p2 = vec2f(
        dot(p, vec2f(127.1, 311.7)),
        dot(p, vec2f(269.5, 183.3))
    );
    return fract(sin(p2) * 43758.5453123);
}

// Irregular gust variation: sum of three incommensurate sines → [0.05, 0.95].
fn gustFactor(t: f32) -> f32 {
    let g = sin(t * 0.41) * 0.5
          + sin(t * 1.17) * 0.3
          + sin(t * 2.73) * 0.2;
    return 0.5 + g * 0.45;
}

// Convert non-linear depth (WebGPU [0,1], 0=near, 1=far) to linear metres.
fn linearizeDepth(d: f32) -> f32 {
    let near = 0.1;
    let far  = 2000.0;
    return near * far / (far - d * (far - near));
}

// Rain streak — velocity points downward (+Y in UV space).
fn rainLayer(uv: vec2f, windVec: vec2f, cellScale: f32, speedMult: f32,
             streakLen: f32, opacity: f32, seed: f32) -> f32 {
    // Offset UV by world position so the cell grid is anchored to the world,
    // not the screen. Camera moving 10m shifts the pattern by ~1 cell.
    let worldUV  = uv + uniforms.cameraXZ * 0.05;
    let scaledUV = worldUV * cellScale;
    let cell     = floor(scaledUV);
    let cellUV   = fract(scaledUV);

    let h        = precipHash2(cell + seed);

    // Density: only render a drop in this cell if a per-cell random < precipitation.
    let densityRand = precipHash2(cell + seed + vec2f(31.0, 47.0)).x;
    if (densityRand > uniforms.precipitation) { return 0.0; }

    // Gravity is +Y (downward in UV space). Wind adds horizontal lean.
    let velocity = windVec * speedMult + vec2f(0.0, 1.0) * speedMult;
    let t        = uniforms.iTime * 0.5 * speedMult;
    let dropUV   = fract(h + velocity * t);

    let delta    = cellUV - dropUV;
    let velDir   = normalize(velocity);
    let along    = dot(delta, velDir);
    let perp     = dot(delta, vec2f(-velDir.y, velDir.x));

    // Streak: thin perpendicular band, trail extends behind (above) the drop head.
    let streak   = smoothstep(0.02, 0.0, abs(perp))
                 * smoothstep(0.0, -streakLen, along)
                 * smoothstep(-streakLen, -streakLen * 0.5, along);

    return streak * opacity;
}

// Snow flake — slow downward drift with lateral sway independent of wind.
fn snowLayer(uv: vec2f, windVec: vec2f, cellScale: f32, speedMult: f32,
             flakeSize: f32, opacity: f32, seed: f32) -> f32 {
    let worldUV  = uv + uniforms.cameraXZ * 0.05;
    let scaledUV = worldUV * cellScale;
    let cell     = floor(scaledUV);
    let cellUV   = fract(scaledUV);

    let h        = precipHash2(cell + seed);

    // Density: only render a flake in this cell if a per-cell random < precipitation.
    let densityRand = precipHash2(cell + seed + vec2f(31.0, 47.0)).x;
    if (densityRand > uniforms.precipitation) { return 0.0; }

    // Lateral sway: screen-space X drift so it works even with zero wind.
    let swayPhase = uniforms.iTime * 0.3 + h.x * 1.28;
    let sway      = sin(swayPhase) * gustFactor(uniforms.iTime) * 0.003;

    let velocity  = windVec * speedMult * 0.3        // wind carry
                  + vec2f(sway, 0.03 * speedMult);  // lateral sway + gravity (downward)

    let t         = uniforms.iTime * speedMult;
    let flakeUV   = fract(h + velocity * t);

    let dist      = length(cellUV - flakeUV);
    return smoothstep(flakeSize, flakeSize * 0.3, dist) * opacity;
}

@fragment
fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let uv       = fragCoord.xy / vec2f(uniforms.resolutionX, uniforms.resolutionY);
    let rawDepth = textureLoad(depthTexture, vec2i(fragCoord.xy), 0);
    let depth    = linearizeDepth(rawDepth);

    let gust           = gustFactor(uniforms.iTime);
    let effectiveSpeed = uniforms.windSpeed * (1.0 + uniforms.gustStrength * gust);
    let windVec        = uniforms.windDirection * effectiveSpeed;

    var rain = 0.0;
    var snow = 0.0;

    // Near layer — large, fast, bright
    if (depth > 2.0) {
        rain += rainLayer(uv, windVec, 8.0,  1.5, 0.12, 0.75, 0.0);
        snow += snowLayer(uv, windVec, 6.0,  1.5, 0.025, 0.85, 10.0);
    }
    // Mid layer
    if (depth > 10.0) {
        rain += rainLayer(uv, windVec, 18.0, 1.0, 0.08, 0.50, 3.7);
        snow += snowLayer(uv, windVec, 14.0, 1.0, 0.015, 0.55, 17.3);
    }
    // Far layer — fine, slow, dim
    if (depth > 40.0) {
        rain += rainLayer(uv, windVec, 40.0, 0.6, 0.05, 0.30, 7.1);
        snow += snowLayer(uv, windVec, 32.0, 0.6, 0.008, 0.35, 23.9);
    }

    // Blend snow and rain by temperature (0=snow, 1=rain, blend zone 0.35–0.65).
    let rainWeight = smoothstep(0.35, 0.65, uniforms.temperature);
    let snowWeight = 1.0 - rainWeight;

    let rainColor  = vec3f(0.75, 0.80, 0.88);
    let snowColor  = vec3f(0.95, 0.97, 1.00);

    let intensity   = uniforms.precipitation * (1.0 - uniforms.shelterAmount);
    // Additive weighted blend so sleet shows both simultaneously.
    let precipColor = (snowColor * snow * snowWeight + rainColor * rain * rainWeight) * intensity;
    let precipAlpha = max(snow * snowWeight, rain * rainWeight) * intensity;

    return vec4f(precipColor, precipAlpha);
}
