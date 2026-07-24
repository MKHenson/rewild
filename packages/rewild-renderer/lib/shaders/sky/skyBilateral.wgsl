// Bilateral filter for cloud edge-preserving softening.
//
// A square kernel weighted by both spatial Gaussian and luminance similarity.
// The range weight (sigmaRange) acts as an edge-stop: samples whose luminance
// differs too much from the center pixel contribute near-zero weight, so
// cloud-sky boundaries stay sharp while uniform cloud interiors are smoothed.
//
// Distance-based blur: the ray direction for each fragment is reconstructed
// via invViewProjMatrix. abs(dir.y) ≈ 0 means looking toward the horizon
// (distant clouds) → blend toward sigmaFar.  abs(dir.y) ≈ 1 means looking
// straight up (nearby clouds) → use sigmaSpatial.
//
// Binding layout (group 0):
//   0 – sourceTexture : texture_2d<f32>
//   1 – sourceSampler : sampler
//   2 – uniforms      : SkyBilateralUniforms

// Kernel half-width in texels, supplied by the pipeline (SkyQuality.ts). It
// bounds the sample loop, so it must be a const rather than a uniform.
const BILATERAL_RADIUS: i32 = ${ BILATERAL_RADIUS };

struct SkyBilateralUniforms {
    resolution        : vec2<f32>,   // width, height in pixels
    sigmaSpatial      : f32,         // near spatial sigma in texels (overhead clouds)
    sigmaRange        : f32,         // log-luminance edge-stop (try 0.5–3.0; see logLuminance())
    sigmaFar          : f32,         // far spatial sigma (horizon clouds, try 4.0–10.0)
    cloudsGated       : f32,         // 1.0 when the cloud pass depth-gated this frame
    _pad1             : vec2<f32>,
    invViewProjMatrix : mat4x4<f32>, // inverse view-projection for ray reconstruction
};

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: SkyBilateralUniforms;
@group(0) @binding(3) var depthTexture: texture_depth_2d;

// A source texel holds real cloud data unless the cloud pass skipped it, which it
// does on terrain-occluded pixels when the camera is below the cloud layer (see the
// depth gate in cloudsTemporal.wgsl). Those texels are vec4f(0) — missing data, not
// black cloud. Identical to the coverage test in skyBloom.wgsl.
fn cloudCoverage(uv: vec2f) -> f32 {
    if (uniforms.cloudsGated < 0.5) {
        return 1.0;
    }
    let dims  = vec2f(textureDimensions(depthTexture));
    let coord = vec2i(clamp(uv, vec2f(0.0), vec2f(1.0)) * dims - 0.5);
    let depth = textureLoad(depthTexture, clamp(coord, vec2i(0), vec2i(dims) - 1), 0);
    return select(0.0, 1.0, depth >= 1.0);
}

fn logLuminance(c: vec3<f32>) -> f32 {
    // Log-luminance compresses the HDR range so the range-sigma is fog-independent.
    // In linear HDR space, a cloud-sky luminance diff can be 10–12 when foginess=0
    // but only 1–3 when fog attenuates distant clouds, causing the edge-stop to
    // behave completely differently based on foginess. In log space the same
    // cloud-sky boundary always produces a diff of ~1.9 regardless of fog level,
    // so sigmaRange tuning is stable across all foginess settings.
    return log(1.0 + dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)));
}

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
    let pos = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
        vec2f(-1.0,  1.0), vec2f(1.0, -1.0), vec2f( 1.0, 1.0),
    );
    return vec4f(pos[vertexIndex], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let uv     = fragCoord.xy / uniforms.resolution;
    let texel  = 1.0 / uniforms.resolution;
    let sigmaR = max(uniforms.sigmaRange, 0.01);

    // Reconstruct view ray direction from this fragment's UV.
    // NDC: x in [-1,1], y flipped for WebGPU (Y-down NDC).
    let ndc  = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
    let near = uniforms.invViewProjMatrix * vec4f(ndc, -1.0, 1.0);
    let far  = uniforms.invViewProjMatrix * vec4f(ndc,  1.0, 1.0);
    let dir  = normalize(far.xyz / far.w - near.xyz / near.w);

    // distanceFactor: 1 at horizon (dir.y ≈ 0), 0 overhead (dir.y ≈ 1).
    // Wider transition range (0.6 instead of 0.4) so clouds at 25–35° elevation
    // (medium distance, above the fog band) still receive meaningful far-sigma blur.
    let distanceFactor = smoothstep(0.6, 0.0, abs(dir.y));

    let sigmaS = mix(max(uniforms.sigmaSpatial, 0.5), max(uniforms.sigmaFar, 0.5), distanceFactor);

    // Preserve the cloud pass's depth gate. A texel it skipped must stay empty, or
    // the blend downstream would composite filtered cloud over terrain.
    if (cloudCoverage(uv) < 0.5) {
        return vec4f(0.0);
    }

    let center    = textureSampleLevel(sourceTexture, sourceSampler, uv, 0.0);
    let centerLum = logLuminance(center.rgb);

    var result      = vec4f(0.0);
    var totalWeight = 0.0;

    // (2R+1)² kernel, R supplied by the pipeline (SkyQuality.ts), which sizes it
    // against the sigmas above — see the bilateralRadius comment there for the
    // truncation figures. Weights are renormalised below, so a tighter kernel
    // narrows the blur rather than darkening it.
    for (var y: i32 = -BILATERAL_RADIUS; y <= BILATERAL_RADIUS; y++) {
        for (var x: i32 = -BILATERAL_RADIUS; x <= BILATERAL_RADIUS; x++) {
            let offset   = vec2f(f32(x), f32(y));
            let sampleUV = uv + offset * texel;
            let s        = textureSampleLevel(sourceTexture, sourceSampler, sampleUV, 0.0);
            let sLum     = logLuminance(s.rgb);

            let d2      = dot(offset, offset);
            let lumDiff = sLum - centerLum;
            let wS      = exp(-0.5 * d2 / (sigmaS * sigmaS));
            let wR      = exp(-0.5 * (lumDiff * lumDiff) / (sigmaR * sigmaR));

            // Drop gated taps entirely. The range weight cannot be relied on to do
            // this: it rejects a vec4f(0) tap well when the cloud is bright, but a
            // dark cloud — dusk, heavy fog — sits close enough to zero in log space
            // that the zeros sail through and darken a band along every terrain
            // silhouette. Renormalising over valid taps only yields the average of
            // what the kernel could actually see.
            let w = wS * wR * cloudCoverage(sampleUV);

            result      += w * s;
            totalWeight += w;
        }
    }

    // The centre tap is valid (gated centres returned above) and carries weight 1.0,
    // so totalWeight is always positive here.
    return result / totalWeight;
}
