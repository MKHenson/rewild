// Two-pass separable Gaussian bloom.
//
// Pass 1 (horizontal=1): reads bilateral HDR clouds, extracts pixels above
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

struct ObjectStruct {
    resolution:     vec2f,
    iTime:          f32,
    bloomAmount:    f32,
    bloomThreshold: f32,
    horizontal:     f32,   // 1.0 = H extraction pass, 0.0 = V blur pass
};

@group(0) @binding(0) var ourSampler: sampler;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> object: ObjectStruct;

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
  let SIGMA    = 8.0;
  let KNEE     = 0.08; 
  let RADIUS   = 15;

  var bloomSum    = vec3f(0.0);
  var totalWeight = 0.0;

  for (var i: i32 = -RADIUS; i <= RADIUS; i++) {
    let sampleUV = uv + dir * f32(i);
    let s        = textureSampleLevel(ourTexture, ourSampler, sampleUV, 0.0);
    let gaussW   = gaussian(f32(i), SIGMA);

    if (isH) {
      // Horizontal pass: only accumulate pixels above the bloom threshold.
      let exposedLum = dot(EXPOSURE * s.rgb, vec3f(0.2126, 0.7152, 0.0722));
      let excess     = softKnee(exposedLum, object.bloomThreshold, KNEE);
      bloomSum += s.rgb * excess * gaussW;
    } else {
      // Vertical pass: blur the H-extracted highlights, no re-thresholding.
      bloomSum += s.rgb * gaussW;
    }

    totalWeight += gaussW;
  }

  var result = vec3f(0.0);
  if (totalWeight > 0.0) {
    result = bloomSum / totalWeight;
  }

  // bloomAmount is applied once, on the final (vertical) pass only.
  let scale = select(object.bloomAmount, 1.0, isH);
  return vec4f(result * scale, 1.0);
}


fn gaussian(x: f32, sigma: f32) -> f32 {
  return exp(-0.5 * x * x / (sigma * sigma));
}

fn softKnee(x: f32, threshold: f32, knee: f32) -> f32 {
  let lower = threshold - knee;
  let upper = threshold + knee;
  if (x <= lower) { return 0.0; }
  if (x >= upper) { return x - threshold; }
  let t = (x - lower) / (2.0 * knee);
  return knee * t * t;
}
