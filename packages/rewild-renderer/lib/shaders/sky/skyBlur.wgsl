// Separable two-pass Gaussian blur for cloud edge softening.
//
// This pass runs at cloud texture resolution (before bloom / tonemap) so it
// operates on the full-precision HDR cloud values.  It uses a 9-tap
// kernel whose half-width is controlled by the 'blurSigma' uniform, so
// the amount of softening can be tuned without a shader rebuild.
//
// The same shader is re-used for both the horizontal and the vertical pass;
// the 'horizontal' uniform flag switches the sample direction.
//
// Binding layout (group 0):
//   0 – sourceTexture  : texture_2d<f32>
//   1 – sourceSampler  : sampler
//   2 – uniforms       : SkyBlurUniforms

struct SkyBlurUniforms {
    resolution : vec2<f32>,  // width, height of the source texture
    blurSigma  : f32,        // Gaussian sigma in texels (try 2.0 – 4.0)
    horizontal : f32,        // 1.0 = horizontal pass, 0.0 = vertical pass
};

@group(0) @binding(0)
var sourceTexture: texture_2d<f32>;

@group(0) @binding(1)
var sourceSampler: sampler;

@group(0) @binding(2)
var<uniform> uniforms: SkyBlurUniforms;

// Precomputed 9-tap Gaussian weights for a given sigma.
// Offsets: -4, -3, -2, -1, 0, +1, +2, +3, +4 texels.
fn gaussianWeight(offset: f32, sigma: f32) -> f32 {
    return exp(-0.5 * (offset * offset) / (sigma * sigma));
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
    let uv      = fragCoord.xy / uniforms.resolution;
    let texel   = 1.0 / uniforms.resolution;
    let sigma   = max(uniforms.blurSigma, 0.5);
    let isHoriz = uniforms.horizontal > 0.5;

    // 9-tap separable Gaussian kernel (±4 texels)
    var result     = vec4f(0.0);
    var totalWeight = 0.0;

    for (var i: i32 = -4; i <= 4; i++) {
        let w = gaussianWeight(f32(i), sigma);
        var offset: vec2f;
        if (isHoriz) {
            offset = vec2f(f32(i) * texel.x, 0.0);
        } else {
            offset = vec2f(0.0, f32(i) * texel.y);
        }
        result      += w * textureSampleLevel(sourceTexture, sourceSampler, uv + offset, 0.0);
        totalWeight += w;
    }

    return result / totalWeight;
}
