// Blend sub-pass: composites HDR sky and HDR clouds into a single rgba16float
// intermediate buffer without any tonemapping. The bloom pass and final tonemap
// pass consume this buffer so the full scene (sky + clouds) feeds both.

struct BlendUniformStruct {
    resolution: vec2f,
    cloudsGated: f32,   // 1.0 when the cloud pass depth-gated this frame
    _pad0: f32,
};

@group(0) @binding(0) var skyTexture: texture_2d<f32>;
@group(0) @binding(1) var cloudsTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> object: BlendUniformStruct;
@group(0) @binding(3) var texSampler: sampler;
@group(0) @binding(4) var depthTexture: texture_depth_2d;

// A cloud texel holds real data unless the cloud pass skipped it. It depth-gates
// terrain-occluded pixels when the camera is below the cloud layer, leaving vec4f(0)
// behind — missing data, not transparent sky. Same test as skyBloom.wgsl and
// skyBilateral.wgsl.
fn cloudTexelValid(texel: vec2i, cloudDims: vec2f) -> f32 {
    if (object.cloudsGated < 0.5) {
        return 1.0;
    }
    let texelUV = (vec2f(texel) + 0.5) / cloudDims;
    let dDims   = vec2f(textureDimensions(depthTexture));
    let coord   = vec2i(clamp(texelUV, vec2f(0.0), vec2f(1.0)) * dDims - 0.5);
    let depth   = textureLoad(depthTexture, clamp(coord, vec2i(0), vec2i(dDims) - 1), 0);
    return select(0.0, 1.0, depth >= 1.0);
}

// Clouds render at a fraction of canvas resolution, so this pass upsamples them.
// A plain bilinear fetch interpolates the gated zeros into neighbouring sky pixels
// wherever a terrain silhouette crosses the cloud grid, pulling down both cloud
// colour and coverage — which reads as a dark stroke outlining every ridge, and gets
// worse the more opaque the clouds are. Gather the four texels and renormalise over
// the valid ones so the fetch returns the average of what actually exists.
fn sampleCloudsValid(uv: vec2f) -> vec4f {
    let dims  = vec2f(textureDimensions(cloudsTexture));
    let coord = uv * dims - 0.5;
    let base  = floor(coord);
    let frac  = coord - base;
    let maxT  = vec2i(dims) - 1;

    var acc  = vec4f(0.0);
    var wsum = 0.0;

    for (var j = 0; j < 2; j++) {
        for (var i = 0; i < 2; i++) {
            let texel = clamp(vec2i(base) + vec2i(i, j), vec2i(0), maxT);
            let wx    = select(1.0 - frac.x, frac.x, i == 1);
            let wy    = select(1.0 - frac.y, frac.y, j == 1);
            let w     = wx * wy * cloudTexelValid(texel, dims);

            acc  += w * textureLoad(cloudsTexture, texel, 0);
            wsum += w;
        }
    }

    // Every contributing texel was gated — a sky pixel whose whole cloud-resolution
    // neighbourhood is terrain. There is nothing valid to draw from, so report no
    // cloud rather than inventing some.
    if (wsum <= 0.0) {
        return vec4f(0.0);
    }
    return acc / wsum;
}

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let pos = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0,  1.0), vec2f(1.0, -1.0), vec2f( 1.0, 1.0),
  );
  return vec4f(pos[i], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let uv = fragCoord.xy / object.resolution;
    let sky    = textureSampleLevel(skyTexture, texSampler, uv, 0);
    let clouds = sampleCloudsValid(uv);

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
