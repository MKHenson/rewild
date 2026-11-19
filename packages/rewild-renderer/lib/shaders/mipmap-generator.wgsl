struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) texcoord: vec2f,
};

@vertex fn vs(
@builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
    let pos = array(
        vec2f( 0.0,  0.0),  // center
        vec2f( 1.0,  0.0),  // right, center
        vec2f( 0.0,  1.0),  // center, top

        // 2st triangle
        vec2f( 0.0,  1.0),  // center, top
        vec2f( 1.0,  0.0),  // right, center
        vec2f( 1.0,  1.0),  // right, top
    );

    var vsOutput: VSOutput;
    let xy = pos[vertexIndex];
    vsOutput.position = vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
    vsOutput.texcoord = vec2f(xy.x, 1.0 - xy.y);
    return vsOutput;
}

@group(0) @binding(0) var ourSampler: sampler;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;

@fragment fn fs(fsInput: VSOutput) -> @location(0) vec4f {
    return textureSample(ourTexture, ourSampler, fsInput.texcoord);
}

// Coverage mips, for a texture whose alpha is a cutout. Each texel takes the
// colour of the visible texels under it only, weighted by their alpha. A
// plain average would pull in the colour of the transparent texels, which the
// image does not define, and every cutout edge would gain a fringe of it.
@fragment fn fsCoverage(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let size = vec2i(textureDimensions(ourTexture));
    let base = vec2i(position.xy) * 2;
    var weighted = vec3f(0.0);
    var plain = vec3f(0.0);
    var alpha = 0.0;
    for (var y = 0; y < 2; y++) {
        for (var x = 0; x < 2; x++) {
            let texel = textureLoad(ourTexture, min(base + vec2i(x, y), size - 1), 0);
            weighted += texel.rgb * texel.a;
            plain += texel.rgb;
            alpha += texel.a;
        }
    }
    // A wholly transparent texel keeps a plain average. fsFill replaces it.
    let rgb = select(plain * 0.25, weighted / alpha, alpha > 0.0);
    return vec4f(rgb, alpha * 0.25);
}

// The pull half of the coverage chain: the coarser level's colour, which the
// blend writes under the transparent texels of this level only. Alpha is 0, so
// the blend keeps this level's own alpha.
@fragment fn fsFill(fsInput: VSOutput) -> @location(0) vec4f {
    return vec4f(textureSampleLevel(ourTexture, ourSampler, fsInput.texcoord, 0.0).rgb, 0.0);
}
