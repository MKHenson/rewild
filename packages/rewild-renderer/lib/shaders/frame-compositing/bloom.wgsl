// Two-pass separable Gaussian bloom, coverage-weighted.
//
// Pass 1 (horizontal=1): reads the HDR sky+cloud blend, extracts pixels above
//   bloomThreshold (in exposure-adjusted luminance), applies horizontal
//   Gaussian weights, writes to an intermediate rgba16float texture.
//
// Pass 2 (horizontal=0): reads the intermediate, applies vertical Gaussian
//   weights (no threshold — extraction already done), writes final HDR
//   bloom highlights to renderTarget.
//
// The composite pass adds the renderTarget to the HDR cloud colour BEFORE
// tonemapping, so the ACES shoulder naturally compresses bright+bloom into
// a smooth glow with no LDR ring artefact.
//
// ── Coverage weighting ──
// The cloud raymarch is depth-gated (cloudsTemporal.wgsl): when the camera is
// below the cloud layer it writes vec4f(0) on terrain-occluded pixels rather
// than paying for a march that will be hidden. Those pixels are not black sky,
// they are *missing data*, and a plain Gaussian averaged them in — dividing by
// a full-kernel weight while summing only a partial kernel. The result was a
// systematically under-bloomed band tracing every terrain silhouette, ~sigma
// wide. So each tap carries a validity flag, the kernel renormalises over valid
// taps only, and alpha carries the coverage fraction forward so the separable
// second pass can renormalise the same way.

struct ObjectStruct {
    resolution:     vec2f,
    iTime:          f32,
    bloomAmount:    f32,
    bloomThreshold: f32,
    horizontal:     f32,   // 1.0 = H extraction pass, 0.0 = V blur pass
    cloudsGated:    f32,   // 1.0 when the cloud pass depth-gated this frame
};

@group(0) @binding(0) var ourSampler: sampler;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> object: ObjectStruct;
@group(0) @binding(3) var depthTexture: texture_depth_2d;

// A source texel holds real cloud data unless the cloud pass skipped it. That
// happens only where terrain occludes AND the camera is below the cloud layer;
// above the layer clouds are marched full-screen and everything is valid.
fn cloudCoverage(uv: vec2f) -> f32 {
    if (object.cloudsGated < 0.5) {
        return 1.0;
    }
    let dims  = vec2f(textureDimensions(depthTexture));
    let coord = vec2i(clamp(uv, vec2f(0.0), vec2f(1.0)) * dims - 0.5);
    let depth = textureLoad(depthTexture, clamp(coord, vec2i(0), vec2i(dims) - 1), 0);
    return select(0.0, 1.0, depth >= 1.0);
}

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let pos = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0,  1.0), vec2f(1.0, -1.0), vec2f( 1.0, 1.0),
  );
  return vec4f(pos[i], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let uv         = fragCoord.xy / object.resolution;
  let texelSize  = 1.0 / object.resolution;
  let isH        = object.horizontal > 0.5;
  let dir        = select(vec2f(0.0, texelSize.y), vec2f(texelSize.x, 0.0), isH);

  let EXPOSURE = 0.001;

  // The knee is the soft shoulder either side of the threshold, so it only makes
  // sense as a fraction of it. It used to be a fixed 0.08 against a threshold of
  // 0.05, which put the ramp's lower edge at -0.03: below black. softKnee could
  // then never return zero, so every coloured pixel in the frame bloomed in
  // proportion to its brightness and the threshold gated nothing at all. Scaling
  // it keeps the shoulder proportionate wherever bloomThreshold is dialled to.
  let KNEE     = object.bloomThreshold * 0.5;

  // Supplied by the pipeline (SkyQuality.ts). RADIUS bounds the loop, and SIGMA
  // moves with it: at the shipped ratio the kernel already truncates a
  // non-trivial tail, so shrinking the radius on its own would hard-cut the
  // bloom rather than narrow it.
  let SIGMA    = ${ BLOOM_SIGMA };
  let RADIUS   = ${ BLOOM_RADIUS };

  var bloomSum    = vec3f(0.0);
  var totalWeight = 0.0;   // sum of gaussW * validity — the renormalisation divisor
  var kernelWeight = 0.0;  // sum of gaussW — the full kernel, for the coverage ratio

  for (var i: i32 = -RADIUS; i <= RADIUS; i++) {
    let sampleUV = uv + dir * f32(i);
    let s        = textureSampleLevel(ourTexture, ourSampler, sampleUV, 0.0);
    let gaussW   = gaussian(f32(i), SIGMA);

    // H reads the blend buffer and must consult depth; V reads the H output,
    // where alpha already carries that row's coverage.
    let validity = select(s.a, cloudCoverage(sampleUV), isH);
    let w        = gaussW * validity;

    if (isH) {
      // Horizontal pass: only accumulate pixels above the bloom threshold.
      let exposedLum = dot(EXPOSURE * s.rgb, vec3f(0.2126, 0.7152, 0.0722));
      let excess     = softKnee(exposedLum, object.bloomThreshold, KNEE);
      bloomSum += s.rgb * excess * w;
    } else {
      // Vertical pass: blur the H-extracted highlights, no re-thresholding.
      bloomSum += s.rgb * w;
    }

    totalWeight  += w;
    kernelWeight += gaussW;
  }

  // Divide by the weight actually accumulated, not the full kernel, so a
  // partially-occluded neighbourhood yields the average of what it could see
  // rather than a value biased toward zero.
  var result = vec3f(0.0);
  if (totalWeight > 0.0) {
    result = bloomSum / totalWeight;
  }

  // bloomAmount is applied once, on the final (vertical) pass only.
  let scale    = select(object.bloomAmount, 1.0, isH);
  let coverage = select(1.0, totalWeight / kernelWeight, isH);
  return vec4f(result * scale, coverage);
}


fn gaussian(x: f32, sigma: f32) -> f32 {
  return exp(-0.5 * x * x / (sigma * sigma));
}

// Excess above `threshold`, with a quadratic shoulder of half-width `knee` on
// either side so highlights fade in smoothly instead of popping across the gate.
// Continuous at both edges: 0 at threshold-knee, and knee at threshold+knee,
// which is exactly what the linear branch gives there.
fn softKnee(x: f32, threshold: f32, knee: f32) -> f32 {
  // A knee wider than the threshold would put the ramp's lower edge below zero,
  // where nothing can be rejected and the function stops being a gate. Callers
  // should keep it well under; clamping means a bad value degrades to a hard
  // cutoff rather than to no cutoff at all.
  let k = min(knee, threshold);
  if (k <= 0.0) { return max(x - threshold, 0.0); }

  let lower = threshold - k;
  let upper = threshold + k;
  if (x <= lower) { return 0.0; }
  if (x >= upper) { return x - threshold; }
  let t = (x - lower) / (2.0 * k);
  return k * t * t;
}
