// Bilateral filter for cloud edge-preserving softening.
//
// A 5×5 kernel weighted by both spatial Gaussian and luminance similarity.
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

struct SkyBilateralUniforms {
    resolution        : vec2<f32>,   // width, height in pixels
    sigmaSpatial      : f32,         // near spatial sigma in texels (overhead clouds)
    sigmaRange        : f32,         // luminance edge-stop sigma (try 0.05–0.20)
    sigmaFar          : f32,         // far spatial sigma (horizon clouds, try 4.0–10.0)
    _pad0             : f32,
    _pad1             : vec2<f32>,
    invViewProjMatrix : mat4x4<f32>, // inverse view-projection for ray reconstruction
};

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: SkyBilateralUniforms;

fn luminance(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
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
    let distanceFactor = smoothstep(0.4, 0.0, abs(dir.y));

    let sigmaS = mix(max(uniforms.sigmaSpatial, 0.5), max(uniforms.sigmaFar, 0.5), distanceFactor);

    let center    = textureSampleLevel(sourceTexture, sourceSampler, uv, 0.0);
    let centerLum = luminance(center.rgb);

    var result      = vec4f(0.0);
    var totalWeight = 0.0;

    // 5×5 kernel (±2 texels)
    for (var y: i32 = -2; y <= 2; y++) {
        for (var x: i32 = -2; x <= 2; x++) {
            let offset   = vec2f(f32(x), f32(y));
            let sampleUV = uv + offset * texel;
            let s        = textureSampleLevel(sourceTexture, sourceSampler, sampleUV, 0.0);
            let sLum     = luminance(s.rgb);

            let d2      = dot(offset, offset);
            let lumDiff = sLum - centerLum;
            let wS      = exp(-0.5 * d2 / (sigmaS * sigmaS));
            let wR      = exp(-0.5 * (lumDiff * lumDiff) / (sigmaR * sigmaR));
            let w       = wS * wR;

            result      += w * s;
            totalWeight += w;
        }
    }

    return result / totalWeight;
}
