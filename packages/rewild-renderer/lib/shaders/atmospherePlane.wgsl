struct Uniforms {
    viewDirectionProjectionInverse: mat4x4f,
};

struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) pos: vec4f,
};

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(0) @binding(1) var ourSampler: sampler;
@group(0) @binding(2) var ourTexture: texture_cube<f32>;

@vertex fn vs(@builtin(vertex_index) vNdx: u32) -> VSOutput {
    let pos = array(
        vec2f(-1, 3),
        vec2f(-1,-1),
        vec2f( 3,-1),
    );
    var vsOut: VSOutput;
    vsOut.position = vec4f(pos[vNdx], 1, 1);
    vsOut.pos = vsOut.position;
    return vsOut;
}

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
    let t = uni.viewDirectionProjectionInverse * vsOut.pos;
    return textureSample(ourTexture, ourSampler, normalize(t.xyz / t.w) * vec3f(1, 1, -1));
}