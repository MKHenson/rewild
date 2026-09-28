// FFT ocean (Tessendorf): per cascade, a tile of FFT_N² texels whose spectrum
// is JONSWAP with directional spreading, for a local wind sea and a swell.
// Adapted from Tidewater's OceanFFT (MIT, Dan Greenheck).
//
// When the spectrum changes: `initSpectrum` then `conjugate`. Every frame:
// `rows` evolves the spectrum to the current time and inverse-transforms each
// row; `columns` transforms each column, writes the displacement (Dx, Dy, Dz,
// foam) and slope (dDy/dx, dDy/dz, dDx/dx, dDz/dz) textures, and ages the
// foam; `mipsNear` and `mipsFar` build both textures' mip chains.

const FFT_N: u32 = ${ FFT_N };
const FFT_HALF: u32 = ${ FFT_HALF };
const FFT_LOG2N: u32 = ${ FFT_LOG2N };
const FFT_G: f32 = 9.81;
const FFT_PI: f32 = 3.14159265;
const FFT_TWO_PI: f32 = 6.2831853;

struct OceanParams {
  // Per cascade: x tile size in metres.
  sizes : array<vec4f, 4>,
  // Per cascade: xy the band of wavenumbers it holds.
  cuts : array<vec4f, 4>,
  // Per system (wind sea, swell): scale, direction in radians, spread blend,
  // swell.
  systemA : array<vec4f, 2>,
  // Per system: JONSWAP alpha, peak angular frequency, peak enhancement,
  // short-wave fade length.
  systemB : array<vec4f, 2>,
  // Per system: x the share of the energy spread over all directions.
  systemC : array<vec4f, 2>,
  // Per cascade: x the Jacobian below which foam grows, y how fast it grows a
  // second for each unit below, z how fast it decays a second.
  foam : array<vec4f, 4>,
  choppiness : f32,
  // Seconds on the looping ocean clock.
  time : f32,
  // Seconds since the last frame.
  dt : f32,
  // Water depth for the dispersion, metres.
  depth : f32,
  seed : u32,
  // Every angular frequency is a whole multiple of this, so the clock loops.
  loopOmega : f32,
}

@group(0) @binding(0) var<uniform> ocean : OceanParams;
// Per texel: h0(k) and conj(h0(−k)).
@group(0) @binding(1) var<storage, read_write> h0 : array<vec4f>;
// Per texel: kx, kz, 1 / |k|, ω.
@group(0) @binding(2) var<storage, read_write> waveData : array<vec4f>;
// Per texel, two vec4: the row transforms, and scratch for h0(k) at init.
@group(0) @binding(3) var<storage, read_write> scratch : array<vec4f>;
// Per texel: the foam, carried from frame to frame.
@group(0) @binding(4) var<storage, read_write> foam : array<f32>;
// Per texel, two vec4: level 0 of both textures, for the mip chains.
@group(0) @binding(5) var<storage, read_write> mipSource : array<vec4f>;
// Per cascade, 16² texels of level 4 of both textures.
@group(0) @binding(6) var<storage, read_write> mipMiddle : array<vec4f>;
@group(0) @binding(7) var displacementOut : texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(8) var slopeOut : texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(9) var mipOut0 : texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(10) var mipOut1 : texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(11) var mipOut2 : texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(12) var mipOut3 : texture_storage_2d_array<rgba16float, write>;

// Which texture a mip kernel reduces: 0 displacement, 1 slopes.
override MIP_SOURCE : u32 = 0u;

var<workgroup> fftShared : array<vec4f, ${ FFT_SHARED }>;
var<workgroup> mipA : array<vec4f, 256>;
var<workgroup> mipB : array<vec4f, 64>;
var<workgroup> mipC : array<vec4f, 16>;
var<workgroup> mipD : array<vec4f, 4>;

fn pcg(v : u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn toUnit(h : u32) -> f32 {
  return f32(h >> 8u) * (1.0 / 16777216.0) + (0.5 / 16777216.0);
}

fn bitReverse(v : u32) -> u32 {
  return reverseBits(v) >> (32u - FFT_LOG2N);
}

// Two packed complex numbers (v.xy, v.zw) times the complex w.
fn cmul2(v : vec4f, w : vec2f) -> vec4f {
  return vec4f(
    v.x * w.x - v.y * w.y, v.x * w.y + v.y * w.x,
    v.z * w.x - v.w * w.y, v.z * w.y + v.w * w.x
  );
}

fn dispersion(k : f32) -> f32 {
  return sqrt(k * FFT_G * tanh(min(k * ocean.depth, 20.0)));
}

fn dispersionDerivative(k : f32) -> f32 {
  let kd = min(k * ocean.depth, 20.0);
  let th = tanh(kd);
  let ch = cosh(kd);
  return FFT_G * (ocean.depth * k / (ch * ch) + th) / dispersion(k) * 0.5;
}

// Shallow-water correction to the JONSWAP spectrum (TMA).
fn tmaCorrection(omega : f32) -> f32 {
  let omegaH = omega * sqrt(ocean.depth / FFT_G);
  let a = omegaH * omegaH * 0.5;
  let b = 1.0 - pow(2.0 - omegaH, 2.0) * 0.5;
  return select(select(1.0, b, omegaH < 2.0), a, omegaH <= 1.0);
}

fn jonswap(omega : f32, a : vec4f, b : vec4f) -> f32 {
  let alpha = b.x;
  let peakOmega = b.y;
  let gamma = b.z;
  let sigma = select(0.09, 0.07, omega <= peakOmega);
  let d = omega - peakOmega;
  let r = exp(-d * d / (sigma * sigma * peakOmega * peakOmega * 2.0));
  let inv = 1.0 / omega;
  return a.x * tmaCorrection(omega) * alpha * FFT_G * FFT_G
    * pow(inv, 5.0)
    * exp(pow(peakOmega * inv, 4.0) * -1.25)
    * pow(abs(gamma), r);
}

fn spreadNormalisation(s : f32) -> f32 {
  let s2 = s * s;
  let s3 = s2 * s;
  let s4 = s3 * s;
  let low = s4 * -0.000564 + s3 * 0.00776 - s2 * 0.044 + s * 0.192 + 0.163;
  let high = s4 * -4.80e-08 + s3 * 1.07e-05 - s2 * 9.53e-04 + s * 5.90e-02 + 3.93e-01;
  return select(high, low, s < 5.0);
}

// How the energy at `omega` spreads over directions `theta`: a cos² lobe
// blended toward the Donelan-Banner cos^2s, narrower for swell, then a share
// `omni` spread evenly over all directions.
fn directionSpread(theta : f32, omega : f32, a : vec4f, b : vec4f, omni : f32) -> f32 {
  let ratio = omega / b.y;
  let spreadPower = select(pow(abs(ratio), 5.0) * 6.97, pow(abs(ratio), -2.5) * 9.77, omega > b.y);
  let s = spreadPower + tanh(min(ratio, 20.0)) * 16.0 * a.w * a.w;
  let dTheta = theta - a.y;
  let cos2s = spreadNormalisation(s) * pow(abs(cos(dTheta * 0.5)), s * 2.0);
  let cosT = cos(dTheta);
  let lobe = cosT * cosT * (2.0 / FFT_PI) * select(0.0, 1.0, cosT > 0.0);
  return mix(mix(lobe, cos2s, a.z), 1.0 / FFT_TWO_PI, omni);
}

fn shortWaveFade(k : f32, b : vec4f) -> f32 {
  return exp(-b.w * b.w * k * k);
}

@compute @workgroup_size(16, 16, 1)
fn initSpectrum(@builtin(global_invocation_id) id : vec3u) {
  let c = id.z;
  let index = c * FFT_N * FFT_N + id.y * FFT_N + id.x;

  let size = ocean.sizes[c].x;
  let dk = FFT_TWO_PI / size;
  let kx = (f32(id.x) - f32(FFT_HALF)) * dk;
  let kz = (f32(id.y) - f32(FFT_HALF)) * dk;
  let kLength = length(vec2f(kx, kz));

  var amplitude = vec2f(0.0);
  var wave = vec4f(kx, kz, 0.0, 0.0);
  if (kLength >= ocean.cuts[c].x && kLength <= ocean.cuts[c].y) {
    let omega = dispersion(kLength);
    let theta = atan2(kz, kx);
    var spectrum = 0.0;
    for (var s = 0u; s < 2u; s++) {
      let a = ocean.systemA[s];
      let b = ocean.systemB[s];
      let omni = ocean.systemC[s].x;
      spectrum += jonswap(omega, a, b) * directionSpread(theta, omega, a, b, omni) * shortWaveFade(kLength, b);
    }
    // E|h0|² = S(k) dk² / 2, so the height variance is Σ S(k) dk².
    let scale = sqrt(max(spectrum, 0.0) * abs(dispersionDerivative(kLength)) / kLength * dk * dk) * 0.5;

    let seed = index * 4u + ocean.seed * 7919u;
    let u1 = toUnit(pcg(seed));
    let u2 = toUnit(pcg(seed + 1u));
    let r = sqrt(log(u1) * -2.0);
    amplitude = vec2f(r * cos(u2 * FFT_TWO_PI), r * sin(u2 * FFT_TWO_PI)) * scale;

    let looped = max(round(omega / ocean.loopOmega), 1.0) * ocean.loopOmega;
    wave = vec4f(kx, kz, 1.0 / kLength, looped);
  }

  scratch[index * 2u] = vec4f(amplitude, 0.0, 0.0);
  waveData[index] = wave;
}

@compute @workgroup_size(16, 16, 1)
fn conjugate(@builtin(global_invocation_id) id : vec3u) {
  let base = id.z * FFT_N * FFT_N;
  let index = base + id.y * FFT_N + id.x;
  let mirrored = base + ((FFT_N - id.y) % FFT_N) * FFT_N + (FFT_N - id.x) % FFT_N;
  let here = scratch[index * 2u].xy;
  let there = scratch[mirrored * 2u].xy;
  h0[index] = vec4f(here, there.x, -there.y);
}

// The radix-2 butterflies over fftShared, bit-reversed on entry.
fn transform(t : u32) {
  for (var s = 0u; s < FFT_LOG2N; s++) {
    let half = 1u << s;
    let pos = t & (half - 1u);
    let i = ((t >> s) << (s + 1u)) | pos;
    let j = i + half;
    let angle = f32(pos) * FFT_PI / f32(half);
    let w = vec2f(cos(angle), sin(angle));
    let i2 = i * 2u;
    let j2 = j * 2u;
    let a0 = fftShared[i2];
    let a1 = fftShared[i2 + 1u];
    let b0 = cmul2(fftShared[j2], w);
    let b1 = cmul2(fftShared[j2 + 1u], w);
    fftShared[i2] = a0 + b0;
    fftShared[i2 + 1u] = a1 + b1;
    fftShared[j2] = a0 - b0;
    fftShared[j2 + 1u] = a1 - b1;
    workgroupBarrier();
  }
}

@compute @workgroup_size(${ FFT_HALF }, 1, 1)
fn rows(@builtin(local_invocation_id) local : vec3u, @builtin(workgroup_id) group : vec3u) {
  let t = local.x;
  let base = group.y * FFT_N * FFT_N + group.x * FFT_N;

  for (var e = 0u; e < 2u; e++) {
    let x = t + e * FFT_HALF;
    let index = base + x;
    let w = waveData[index];
    let h = h0[index];
    // The transform sums e^{ik·x}, so a phase of k·x − ωt carries each wave
    // along its k: with the energy spread around the wind, downwind.
    let phase = -w.w * ocean.time;
    let cs = cos(phase);
    let sn = sin(phase);

    // h = h0 e^{−iωt} + conj(h0(−k)) e^{iωt}
    let hr = h.x * cs - h.y * sn + h.z * cs + h.w * sn;
    let hi = h.x * sn + h.y * cs - h.z * sn + h.w * cs;

    let kx = w.x;
    let kz = w.y;
    let ik = w.z;
    let fx = kx * ik;
    let fz = kz * ik;

    // Four complex fields, two real results each:
    // Dx + i Dz, Dy + i dDx/dz, dDy/dx + i dDy/dz, dDx/dx + i dDz/dz.
    let c0 = vec2f(-(fx * hi + fz * hr), fx * hr - fz * hi);
    let q = -(kx * kz * ik);
    let c1 = vec2f(hr - q * hi, hi + q * hr);
    let c2 = vec2f(-(kx * hi + kz * hr), kx * hr - kz * hi);
    let a = -(kx * kx * ik);
    let b = -(kz * kz * ik);
    let c3 = vec2f(a * hr - b * hi, a * hi + b * hr);

    let r = bitReverse(x) * 2u;
    fftShared[r] = vec4f(c0, c1);
    fftShared[r + 1u] = vec4f(c2, c3);
  }
  workgroupBarrier();
  transform(t);

  for (var e = 0u; e < 2u; e++) {
    let x = t + e * FFT_HALF;
    let o = (base + x) * 2u;
    scratch[o] = fftShared[x * 2u];
    scratch[o + 1u] = fftShared[x * 2u + 1u];
  }
}

@compute @workgroup_size(${ FFT_HALF }, 1, 1)
fn columns(@builtin(local_invocation_id) local : vec3u, @builtin(workgroup_id) group : vec3u) {
  let t = local.x;
  let column = group.x;
  let c = group.y;
  let base = c * FFT_N * FFT_N;

  for (var e = 0u; e < 2u; e++) {
    let y = t + e * FFT_HALF;
    let index = base + y * FFT_N + column;
    let r = bitReverse(y) * 2u;
    fftShared[r] = scratch[index * 2u];
    fftShared[r + 1u] = scratch[index * 2u + 1u];
  }
  workgroupBarrier();
  transform(t);

  let lambda = ocean.choppiness;
  for (var e = 0u; e < 2u; e++) {
    let y = t + e * FFT_HALF;
    let index = base + y * FFT_N + column;
    // The spectrum is centred on the tile, which flips every other texel.
    let flip = select(-1.0, 1.0, ((column + y) & 1u) == 0u);
    let A = fftShared[y * 2u] * flip;
    let B = fftShared[y * 2u + 1u] * flip;

    let jxx = lambda * B.z + 1.0;
    let jzz = lambda * B.w + 1.0;
    let jxz = lambda * A.w;
    let jacobian = jxx * jzz - jxz * jxz;

    // Foam grows where the surface folds past the cascade's whitecap, and
    // decays, so a crest that broke leaves its foam behind on the water it
    // moved.
    let settings = ocean.foam[c];
    let made = max(settings.x - jacobian, 0.0) * settings.y * ocean.dt;
    let kept = saturate(foam[index] * exp(-settings.z * ocean.dt) + made);
    foam[index] = kept;

    let texel = vec2u(column, y);
    let displacement = vec4f(lambda * A.x, A.z, lambda * A.y, kept);
    let slopes = vec4f(B.x, B.y, lambda * B.z, lambda * B.w);
    textureStore(displacementOut, texel, c, displacement);
    textureStore(slopeOut, texel, c, slopes);
    mipSource[index * 2u] = displacement;
    mipSource[index * 2u + 1u] = slopes;
  }
}

fn mipSourceAt(c : u32, x : u32, y : u32) -> vec4f {
  return mipSource[(c * FFT_N * FFT_N + y * FFT_N + x) * 2u + MIP_SOURCE];
}

// Levels 1 to 4: each 16² workgroup reduces a 32² block of level 0 through
// workgroup memory, and leaves its level 4 texels in mipMiddle.
@compute @workgroup_size(16, 16, 1)
fn mipsNear(@builtin(local_invocation_id) local : vec3u, @builtin(workgroup_id) group : vec3u) {
  let lx = local.x;
  let ly = local.y;
  let c = group.z;
  let x1 = group.x * 16u + lx;
  let y1 = group.y * 16u + ly;
  let x0 = x1 * 2u;
  let y0 = y1 * 2u;
  let level1 = (mipSourceAt(c, x0, y0) + mipSourceAt(c, x0 + 1u, y0)
    + mipSourceAt(c, x0, y0 + 1u) + mipSourceAt(c, x0 + 1u, y0 + 1u)) * 0.25;
  textureStore(mipOut0, vec2u(x1, y1), c, level1);
  mipA[ly * 16u + lx] = level1;
  workgroupBarrier();

  if (lx < 8u && ly < 8u) {
    let i = ly * 32u + lx * 2u;
    let v = (mipA[i] + mipA[i + 1u] + mipA[i + 16u] + mipA[i + 17u]) * 0.25;
    textureStore(mipOut1, vec2u(group.x * 8u + lx, group.y * 8u + ly), c, v);
    mipB[ly * 8u + lx] = v;
  }
  workgroupBarrier();

  if (lx < 4u && ly < 4u) {
    let i = ly * 16u + lx * 2u;
    let v = (mipB[i] + mipB[i + 1u] + mipB[i + 8u] + mipB[i + 9u]) * 0.25;
    textureStore(mipOut2, vec2u(group.x * 4u + lx, group.y * 4u + ly), c, v);
    mipC[ly * 4u + lx] = v;
  }
  workgroupBarrier();

  if (lx < 2u && ly < 2u) {
    let i = ly * 8u + lx * 2u;
    let v = (mipC[i] + mipC[i + 1u] + mipC[i + 4u] + mipC[i + 5u]) * 0.25;
    let x4 = group.x * 2u + lx;
    let y4 = group.y * 2u + ly;
    textureStore(mipOut3, vec2u(x4, y4), c, v);
    mipMiddle[((c * 16u + y4) * 16u + x4) * 2u + MIP_SOURCE] = v;
  }
}

// Levels 5 to 8: one 8² workgroup per cascade reduces the 16² of level 4.
@compute @workgroup_size(8, 8, 1)
fn mipsFar(@builtin(local_invocation_id) local : vec3u, @builtin(workgroup_id) group : vec3u) {
  let lx = local.x;
  let ly = local.y;
  let c = group.z;
  let at = (c * 16u + ly * 2u) * 16u + lx * 2u;
  let level5 = (mipMiddle[at * 2u + MIP_SOURCE] + mipMiddle[(at + 1u) * 2u + MIP_SOURCE]
    + mipMiddle[(at + 16u) * 2u + MIP_SOURCE] + mipMiddle[(at + 17u) * 2u + MIP_SOURCE]) * 0.25;
  textureStore(mipOut0, vec2u(lx, ly), c, level5);
  mipB[ly * 8u + lx] = level5;
  workgroupBarrier();

  if (lx < 4u && ly < 4u) {
    let i = ly * 16u + lx * 2u;
    let v = (mipB[i] + mipB[i + 1u] + mipB[i + 8u] + mipB[i + 9u]) * 0.25;
    textureStore(mipOut1, vec2u(lx, ly), c, v);
    mipC[ly * 4u + lx] = v;
  }
  workgroupBarrier();

  if (lx < 2u && ly < 2u) {
    let i = ly * 8u + lx * 2u;
    let v = (mipC[i] + mipC[i + 1u] + mipC[i + 4u] + mipC[i + 5u]) * 0.25;
    textureStore(mipOut2, vec2u(lx, ly), c, v);
    mipD[ly * 2u + lx] = v;
  }
  workgroupBarrier();

  if (lx == 0u && ly == 0u) {
    let v = (mipD[0] + mipD[1] + mipD[2] + mipD[3]) * 0.25;
    textureStore(mipOut3, vec2u(0u, 0u), c, v);
  }
}
