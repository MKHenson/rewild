// Blend sub-pass: composites HDR sky and HDR clouds into a single rgba16float
// intermediate buffer without any tonemapping. The bloom pass and final tonemap
// pass consume this buffer so the full scene (sky + clouds) feeds both.

struct BlendUniformStruct {
    resolution: vec2f,
};

@group(0) @binding(0) var skyTexture: texture_2d<f32>;
@group(0) @binding(1) var cloudsTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> object: BlendUniformStruct;
@group(0) @binding(3) var texSampler: sampler;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let pos = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0,  1.0), vec2f(1.0, -1.0), vec2f( 1.0, 1.0),
  );
  return vec4f(pos[i], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let uv = fragCoord.xy / object.resolution;
    let sky    = textureSampleLevel(skyTexture,    texSampler, uv, 0);
    let clouds = textureSampleLevel(cloudsTexture, texSampler, uv, 0);

    // The atmosphere's sun-scatter term peaks at ~290 HDR near the sun.
    // Without a bound, the sky background bleeds into semi-transparent cloud
    // pixels and inflates the intermediate: ACES(0.05*(290*0.2 + 80*0.8)) ≈ 0.998.
    // Cap sky to 20 HDR — the equivalent of the old exp pre-tonemap ceiling
    // (1-exp(-x/8.6) → 1.0 LDR → 20 HDR at HDR_SCALE=0.05).
    // Stars/galaxy in the cubemap are ≤ ~20 HDR, so they pass through unchanged.
    let skyCapped = vec4f(min(sky.rgb, vec3f(20.0)), sky.a);

    let preMultClouds = vec4f(clouds.rgb * clouds.a, clouds.a);
    return skyCapped * (1.0 - preMultClouds.a) + preMultClouds;
}
