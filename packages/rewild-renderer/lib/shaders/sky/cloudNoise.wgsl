// Shared cloud noise functions.
// Requires noiseTexture (texture_2d<f32>) and noiseSampler (sampler) in scope.

fn noise3(x: vec3f) -> f32 {
  let p = floor(x);
  var f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  let uv = (p.xy + vec2f(37.0, 17.0) * p.z) + f.xy;
  let rg = textureSampleLevel(noiseTexture, noiseSampler, (uv + 0.5) / 256.0, 0.0).yx;
  return mix(rg.x, rg.y, f.z);
}

fn fbm(position: vec3f) -> f32 {
  var p = position;
  let m = mat3x3<f32>(
     0.00,  0.80,  0.60,
    -0.80,  0.36, -0.48,
    -0.60, -0.48,  0.64
  );
  var f: f32;
  f  = 0.5000 * noise3(p);
  p = m * p * 2.02;
  f += 0.2500 * noise3(p);
  p = m * p * 2.03;
  f += 0.1250 * noise3(p);
  return f;
}

fn hash1(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453);
}
