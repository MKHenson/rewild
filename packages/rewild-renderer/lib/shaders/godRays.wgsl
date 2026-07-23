struct GodRayUniforms {
    sunScreenPos: vec2<f32>,
    density: f32,
    weight: f32,
    decay: f32,
    exposure: f32,
    numSamples: f32,
    frameIndex: f32,
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

// Full-resolution scene depth, written by the main pass before the sky compositor
// runs. Any texel closer than the far plane is terrain/props occluding the sun.
@group(0) @binding(3)
var depthTexture: texture_depth_2d;

// The cloud pass writes HDR radiance (rgba16float): clear sky lands near 7,
// sunlit cloud tops near 40, and the sun disc between 1000 and 9000
// (see the discBrightness ramp in sky/cloudsTemporal.wgsl). SUN_LUM_MIN sits
// above the cloud range so only the disc and its immediate corona register as
// the disc rather than as bright cloud.
const SUN_LUM_MIN: f32 = 60.0;
const SUN_LUM_MAX: f32 = 400.0;

// Soft-compression knee for sky radiance. Turns unbounded HDR into a 0..1 emitter
// that still ranks sky < cloud rim < sun without a hard clip.
const LUM_KNEE: f32 = 30.0;

// Output scale. The compositor adds this pass into the HDR sum *before* ACES, so
// the result has to live in the same units as the sky (~7) and clouds (~40)
// rather than in 0..1 display space.
const GOD_RAY_HDR_SCALE: f32 = 60.0;

const LUMA: vec3<f32> = vec3<f32>(0.2126, 0.7152, 0.0722);

// Interleaved-gradient noise, rotated per frame. The previous static
// sin/fract hash baked a fixed grain into the half-res upsample; advancing it
// with the frame index lets the pattern average out over time instead.
fn interleavedGradientNoise(pixel: vec2<f32>, frame: f32) -> f32 {
    let p = pixel + 5.588238 * (frame % 64.0);
    return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715))));
}

@fragment
fn fs(
  @builtin(position) fragCoord: vec4<f32>,
) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy / uniforms.resolution;

    let numSamples = i32(uniforms.numSamples);

    // Step proportionally along the pixel -> sun vector, so the march always
    // terminates near the sun and the streak length grows with distance from it.
    // (A fixed-length step in UV, which is what this used to do, gives every pixel
    // the same short smear — that produces a radial blur, never a converging shaft.)
    let delta = (uniforms.sunScreenPos - uv) * (uniforms.density / f32(numSamples));

    // Jitter the start by up to one step to break the banding the low sample
    // count would otherwise produce.
    let noise = interleavedGradientNoise(fragCoord.xy, uniforms.frameIndex);

    var currentPos = uv + delta * noise;
    var currentWeight = 1.0;
    var illumination = 0.0;

    let depthDims = vec2<f32>(textureDimensions(depthTexture));

    for (var i = 0; i < numSamples; i++) {
        currentPos += delta;

        // Zero out samples that leave the screen. The sampler is clamp-to-edge, so
        // without this a march that exits early would keep re-reading the same
        // border texel and inflate the sum with a run of identical values.
        let inBounds = step(vec2(0.0), currentPos) * step(currentPos, vec2(1.0));
        let boundsGate = inBounds.x * inBounds.y;

        // Geometry occlusion. Depth is cleared to 1.0, so anything below that is
        // something the main pass drew — terrain, rocks, trees — and it blocks the
        // sun. This is what carves shafts out of a ridgeline at sunset.
        let texel = vec2<i32>(clamp(currentPos, vec2(0.0), vec2(1.0)) * depthDims);
        let sceneDepth = textureLoad(depthTexture, texel, 0);
        let skyMask = select(0.0, 1.0, sceneDepth >= 1.0);

        let c = textureSampleLevel(cloudTexture, linearSampler, currentPos, 0.0);
        let lum = dot(c.rgb, LUMA);

        // The emitter and the occluder have to be read from different channels.
        // cloudsTemporal.wgsl writes alpha = max(1 - transmittance, sunAlpha), so
        // alpha alone reports the sun disc — the brightest source in the scene — as
        // fully opaque. Luminance identifies the disc; alpha supplies cloud opacity;
        // sunMask exempts the disc from its own occlusion term.
        let sunMask = smoothstep(SUN_LUM_MIN, SUN_LUM_MAX, lum);
        let cloudTransmittance = max(pow(saturate(1.0 - c.a), 2.0), sunMask);

        // Soft-compressed radiance: clear sky contributes a little, the near-sun
        // corona more, the disc almost fully. Clouds are bright too, which is why
        // the transmittance factor has to gate them back down to nearly nothing.
        let skyBrightness = lum / (lum + LUM_KNEE);

        let source = skyBrightness * cloudTransmittance * skyMask * boundsGate;

        illumination += source * currentWeight;
        currentWeight *= uniforms.decay;
    }

    illumination /= f32(numSamples);
    illumination *= uniforms.exposure * uniforms.weight;

    // Gentle radial falloff, only to keep the far corners from picking up a flat
    // pedestal. The old 1.2 cutoff killed everything past ~0.4 UV from the sun,
    // which is exactly the range over which crepuscular rays are supposed to run.
    let dist = length(uniforms.sunScreenPos - uv);
    illumination *= 1.0 - smoothstep(0.6, 2.2, dist);

    let rayColor = uniforms.sunColor * illumination * GOD_RAY_HDR_SCALE;

    return vec4<f32>(rayColor, 1.0);
}
