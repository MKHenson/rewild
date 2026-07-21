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

    // Cap sky at 60 HDR to prevent thin clouds from appearing opaque-white when in front of
    // the bright sun. With HDR_SCALE=0.045: cap at 60 → ACES(2.7) ≈ 0.957 (bright but not
    // peak white). A thin cloud (alpha=0.2) in front: 60*0.8 + cloud*0.2 ≈ 58 → ACES(2.61)
    // ≈ 0.954 (shows some cloud instead of pure white). Sun disk (no cloud) still appears
    // bright and visible even when capped.
    let skyCapped = min(sky.rgb, vec3f(60.0));
    let blended = skyCapped * (1.0 - clouds.a) + clouds.rgb * clouds.a;

    // Alpha carries CLOUD opacity, not the composited alpha. The sky pass used to
    // write alpha=0 on terrain-occluded pixels, which made the composited alpha
    // happen to equal cloud alpha there — the composite's cloudOcclusion term
    // relied on that. Now that the sky is evaluated full-screen (sky.a is 1
    // everywhere) that coincidence is gone, so cloud opacity is passed through
    // explicitly. The composite decides sky-vs-terrain from its own depth test.
    return vec4f(blended, clouds.a);
}
