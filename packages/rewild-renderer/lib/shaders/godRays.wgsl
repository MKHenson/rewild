struct GodRayUniforms {
    sunScreenPos: vec2<f32>,
    density: f32,
    weight: f32,
    decay: f32,
    exposure: f32,
    numSamples: f32,
    _pad: f32,
    sunColor: vec3<f32>,
    _pad2: f32,
    resolution: vec2<f32>,
    _pad3: vec2<f32>,
};

@group(0) @binding(0)
var<uniform> uniforms: GodRayUniforms;

@group(0) @binding(1)
var cloudTexture: texture_2d<f32>;

@group(0) @binding(2)
var linearSampler: sampler;

@fragment
fn fs(
  @builtin(position) fragCoord: vec4<f32>,
) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy / uniforms.resolution;

    let toSun = uniforms.sunScreenPos - uv;
    let dist = length(toSun);
    let dir = toSun / max(dist, 0.001);

    let numSamples = i32(uniforms.numSamples);
    let stepSize = uniforms.density / f32(numSamples);

    // --- Sun visibility gate ---
    // Sample the cloud texture in a ring AROUND the sun disc, not at the disc
    // centre. At the centre, the cloud shader bakes sunAlpha=1 into the alpha
    // channel even in clear sky (the sun disc itself), so a centre sample always
    // looks like a blocked source. The ring sits just outside the disc and reads
    // actual cloud coverage. If it is all cloud, rays should not appear.
    let r = 0.05; // ring radius in UV space — outside the sun disc (~0.01-0.02 UV)
    let ra = textureSample(cloudTexture, linearSampler, uniforms.sunScreenPos + vec2( r,  0.0)).a;
    let rb = textureSample(cloudTexture, linearSampler, uniforms.sunScreenPos + vec2(-r,  0.0)).a;
    let rc = textureSample(cloudTexture, linearSampler, uniforms.sunScreenPos + vec2( 0.0,  r)).a;
    let rd = textureSample(cloudTexture, linearSampler, uniforms.sunScreenPos + vec2( 0.0, -r)).a;
    let ringAlpha = (ra + rb + rc + rd) * 0.25;

    // Bell-shaped visibility: god rays need CONTRAST between cloud shadow and clear
    // gaps. In uniform clear sky (ringAlpha~0) there is no contrast — every sample
    // has the same transmittance, producing only a flat overbrightening glow.
    // In fully overcast sky (ringAlpha~1) the sun is blocked entirely.
    // Rays are strongest at middling coverage (~0.2-0.5) where gaps exist.
    //
    //  ringAlpha=0.00 (clear sky)  -> sunVisibility=0.0  (no rays, no contrast)
    //  ringAlpha=0.15 (thin cloud) -> sunVisibility~0.7
    //  ringAlpha=0.35 (partial)    -> sunVisibility=1.0  (full rays)
    //  ringAlpha=0.70 (heavy)      -> sunVisibility~0.5
    //  ringAlpha=0.90 (overcast)   -> sunVisibility=0.0  (sun fully blocked)
    let sunVisibility = smoothstep(0.0, 0.2, ringAlpha) * (1.0 - smoothstep(0.55, 0.95, ringAlpha));

    // --- Radial blur march (pixel -> sun) ---
    // Forward direction gives the correct radial shaft pattern: highest-weight
    // samples are closest to the current pixel, fading toward the sun.
    var currentPos = uv;
    var currentWeight = 1.0;
    var illumination = 0.0;

    // Per-pixel dithering: offset starting position to break banding
    let noise = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
    currentPos += dir * stepSize * noise;

    for (var i = 0; i < numSamples; i++) {
        currentPos += dir * stepSize;

        // Discard samples that have marched outside [0,1] UV bounds.
        // When the sun is near or past a screen edge the march exits the cloud
        // texture early. clamp-to-edge would return the same border texel for
        // every remaining step, injecting a run of identical values that inflates
        // the accumulated illumination. Zeroing them out prevents this.
        let inBounds = step(vec2(0.0), currentPos) * step(currentPos, vec2(1.0));
        let boundsGate = inBounds.x * inBounds.y;

        // Alpha = max(1 - cloudTransmittance, sunDisc). Clear sky = low alpha.
        let cloudSample = textureSample(cloudTexture, linearSampler, currentPos);
        let sampleT = pow(saturate(1.0 - cloudSample.a), 4.0) * boundsGate;

        illumination += sampleT * currentWeight;
        currentWeight *= uniforms.decay;
    }

    // Normalize, apply exposure, and gate by whether the sun itself is visible.
    illumination /= f32(numSamples);
    illumination *= uniforms.exposure * uniforms.weight;
    illumination *= sunVisibility;

    // Distance falloff: stronger near sun, fades toward screen edges
    let falloff = 1.0 - smoothstep(0.0, 1.2, dist);
    illumination *= falloff;

    // Tint with sun color
    let rayColor = uniforms.sunColor * illumination;

    return vec4<f32>(rayColor, illumination);
}
