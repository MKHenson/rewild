import { LAKE, OCEAN } from '../terrain/Water';
import {
  CALM_PEAK,
  CALM_RESPONSE,
  CHOP_FIELD,
  GRAVITY,
  SWELL_FIELD,
  VARIATION_RANGES,
  WAVE_COUNT,
  WAVE_LOOP_SECONDS,
  WAVE_STEEPNESS,
  WAVE_UNIFORM_FLOATS,
  WIND_TIME_SPEEDUP,
  WaterWaves,
  gridResolve,
  loopingOmega,
  octaveBand,
  rippleTaper,
  waveSpectrum,
} from './WaterWaves';

const PALETTE = [OCEAN, LAKE];
const OCEAN_ONLY = [1, 0, 0, 0];

function steepness(waves: WaterWaves, type: number): number {
  let sum = 0;
  for (let i = 0; i < WAVE_COUNT; i++)
    sum += waves.waves[i].k * waves.amplitudes[i * 4 + type];
  return sum;
}

function response(wind: number): number {
  return CALM_RESPONSE + (1 - CALM_RESPONSE) * wind;
}

// The ocean's total k·A at `wind`: its share of WAVE_STEEPNESS, less what the
// ripple taper takes from octaves under the peak.
function oceanSteepness(waves: WaterWaves, wind: number): number {
  const peak = OCEAN.waveScale * (CALM_PEAK + (1 - CALM_PEAK) * wind);
  const spectrum = new Float64Array(WAVE_COUNT);
  waveSpectrum(peak, spectrum);
  let share = 0;
  for (let i = 0; i < WAVE_COUNT; i++)
    share += spectrum[i] * rippleTaper((Math.PI * 2) / waves.waves[i].k, peak);
  return WAVE_STEEPNESS * OCEAN.waveResponse * response(wind) * share;
}

function run(waves: WaterWaves, seconds: number, x = 1, z = 0, windiness = 1) {
  for (let t = 0; t < seconds; t += 0.1) waves.update(0.1, x, z, windiness, PALETTE);
}

function heights(waves: WaterWaves): number[] {
  const out: number[] = [];
  for (let x = 0; x < 1500; x += 3.7)
    for (let z = 0; z < 300; z += 5.3) out.push(waves.height(x, z, OCEAN_ONLY, 1));
  return out;
}

function peakSlot(waves: WaterWaves): number {
  let best = 0;
  for (let i = 0; i < WAVE_COUNT; i++)
    if (waves.amplitudes[i * 4] > waves.amplitudes[best * 4]) best = i;
  return best;
}

describe('loopingOmega', () => {
  it('stays close to deep-water dispersion', () => {
    for (const wavelength of [1, 11, 60]) {
      const k = (Math.PI * 2) / wavelength;
      expect(loopingOmega(k)).toBeCloseTo(Math.sqrt(GRAVITY * k), 1);
    }
  });

  it('completes whole cycles over the loop', () => {
    const cycles = (loopingOmega((Math.PI * 2) / 19) * WAVE_LOOP_SECONDS) / (Math.PI * 2);
    expect(cycles).toBeCloseTo(Math.round(cycles), 9);
  });
});

describe('waveSpectrum', () => {
  it('sums to one and peaks near the given wavelength', () => {
    const out = new Float64Array(WAVE_COUNT);
    waveSpectrum(30, out);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    const peak = out.indexOf(Math.max(...out));
    waveSpectrum(4, out);
    expect(out.indexOf(Math.max(...out))).toBeGreaterThan(peak);
  });
});

describe('rippleTaper', () => {
  it('keeps the peak and longer, and thins ripples far under it', () => {
    expect(rippleTaper(30, 30)).toBe(1);
    expect(rippleTaper(60, 30)).toBe(1);
    expect(rippleTaper(0.3, 30)).toBeCloseTo(Math.pow(0.01, 0.25), 9);
  });
});

describe('gridResolve', () => {
  it('holds octaves of eight spacings and drops those of four', () => {
    expect(gridResolve(64, 8)).toBe(1);
    expect(gridResolve(32, 8)).toBe(0);
    expect(gridResolve(48, 8)).toBeCloseTo(0.5, 9);
  });
});

describe('WaterWaves', () => {
  it('keeps some chop in a calm', () => {
    const waves = new WaterWaves();
    run(waves, 1, 1, 0, 0);
    expect(steepness(waves, 0)).toBeCloseTo(oceanSteepness(waves, 0), 9);
    expect(waves.drag[0]).toBeGreaterThan(0);
    expect(waves.height(10, 20, OCEAN_ONLY, 1)).not.toBe(0);
  });

  it('follows the wind at once', () => {
    const waves = new WaterWaves();
    waves.update(0.016, 1, 0, 1, PALETTE);
    expect(steepness(waves, 0)).toBeCloseTo(oceanSteepness(waves, 1), 9);
    waves.update(0.016, 1, 0, 0, PALETTE);
    expect(steepness(waves, 0)).toBeCloseTo(oceanSteepness(waves, 0), 9);
  });

  it('scales the waves with the wind', () => {
    const waves = new WaterWaves();
    run(waves, 1, 1, 0, 0.25);
    const breeze = steepness(waves, 0);
    expect(breeze).toBeCloseTo(oceanSteepness(waves, 0.25), 9);
    run(waves, 1, 1, 0, 0.05);
    expect(steepness(waves, 0)).toBeCloseTo(oceanSteepness(waves, 0.05), 9);
    expect(steepness(waves, 0)).toBeLessThan(breeze);
  });

  it('raises longer waves and more drag in a stronger wind', () => {
    const breeze = new WaterWaves();
    run(breeze, 1, 1, 0, 0.3);
    const gale = new WaterWaves();
    run(gale, 1, 1, 0, 1);
    expect(peakSlot(gale)).toBeLessThan(peakSlot(breeze));
    expect(gale.drag[0]).toBeGreaterThan(breeze.drag[0]);
  });

  it('averages to the level, with crests taller than troughs are deep', () => {
    const waves = new WaterWaves();
    run(waves, 5);
    const h = heights(waves);
    const mean = h.reduce((a, b) => a + b, 0) / h.length;
    const top = Math.max(...h);
    const bottom = Math.min(...h);
    expect(Math.abs(mean)).toBeLessThan((top - bottom) * 0.02);
    expect(top).toBeGreaterThan(-bottom);
  });

  it('drags each octave along the ones before it', () => {
    const waves = new WaterWaves();
    run(waves, 5);
    const dragged = waves.height(123, 45, OCEAN_ONLY, 1);
    waves.drag.fill(0);
    expect(waves.height(123, 45, OCEAN_ONLY, 1)).not.toBeCloseTo(dragged, 3);
  });

  it('leaves octaves the grid cannot hold out of the height', () => {
    const waves = new WaterWaves();
    run(waves, 5);
    expect(waves.height(123, 45, OCEAN_ONLY, 1000)).toBe(0);
  });

  it('varies the swell and the chop over space, each across its range', () => {
    const waves = new WaterWaves();
    run(waves, 1);
    const swell: number[] = [];
    const chop: number[] = [];
    for (let x = 0; x < 20000; x += 53) {
      swell.push(waves.variation(x, 1234, SWELL_FIELD));
      chop.push(waves.variation(x, 1234, CHOP_FIELD));
    }
    for (const [field, samples] of [swell, chop].entries()) {
      const [low, high] = VARIATION_RANGES[field];
      expect(Math.min(...samples)).toBeGreaterThanOrEqual(low);
      expect(Math.max(...samples)).toBeLessThanOrEqual(high);
      expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan((high - low) * 0.7);
    }
    // Independent fields: somewhere the swell is high where the chop is low.
    let crossed = 0;
    for (let i = 0; i < swell.length; i++) if (swell[i] > 1 && chop[i] < 0.5) crossed++;
    expect(crossed).toBeGreaterThan(0);
  });

  it('takes long octaves from the swell field and short ones from the chop', () => {
    const waves = new WaterWaves();
    expect(octaveBand(waves.waves[0].k)).toBeLessThan(0.05);
    expect(octaveBand(waves.waves[WAVE_COUNT - 1].k)).toBeGreaterThan(0.95);
  });

  it('drifts the variation downwind', () => {
    const waves = new WaterWaves();
    run(waves, 1);
    const before = waves.variationOffset[0];
    run(waves, 10);
    expect(waves.variationOffset[0]).not.toBeCloseTo(before, 6);
  });

  it('spreads the octaves over every direction, whatever the wind', () => {
    const waves = new WaterWaves();
    const before = waves.waves.map((w) => [w.dirX, w.dirZ]);
    run(waves, 1, 0, 1);
    expect(waves.waves.map((w) => [w.dirX, w.dirZ])).toEqual(before);

    let x = 0;
    let z = 0;
    for (const w of waves.waves) {
      x += w.dirX;
      z += w.dirZ;
    }
    expect(Math.hypot(x, z) / WAVE_COUNT).toBeLessThan(0.15);
    const lengths = waves.waves.map((w) => w.k);
    expect(new Set(lengths).size).toBe(WAVE_COUNT);
  });

  it('packs phases from a snapped origin near the camera, wrapped to one turn', () => {
    const waves = new WaterWaves();
    run(waves, 1);
    waves.setOrigin(-19642, 26737);
    expect(waves.originX).toBe(-19456);
    expect(waves.originZ).toBe(26624);

    const out = new Float32Array(WAVE_UNIFORM_FLOATS);
    waves.pack(1, 0, 0, 2, [], [], [1, 0, 0.5, 12], out);
    expect(out[4]).toBe(-19456);
    expect(out[5]).toBe(26624);
    for (let i = 0; i < WAVE_COUNT; i++) {
      const wave = waves.waves[i];
      const packed = out[44 + WAVE_COUNT * 8 + i];
      expect(packed).toBeGreaterThanOrEqual(0);
      expect(packed).toBeLessThan(Math.PI * 2);
      // The phase anywhere is the packed phase plus k·D from the origin.
      const x = -19600;
      const z = 26700;
      const world = wave.k * (wave.dirX * x + wave.dirZ * z) + wave.phase;
      const local =
        wave.k * (wave.dirX * (x - out[4]) + wave.dirZ * (z - out[5])) + packed;
      const diff = world - local;
      expect(Math.abs(diff - Math.round(diff / (Math.PI * 2)) * Math.PI * 2)).toBeLessThan(1e-5);
    }
  });

  it('wraps its clock', () => {
    const waves = new WaterWaves();
    run(waves, WAVE_LOOP_SECONDS + 1);
    expect(waves.time).toBeLessThan(WAVE_LOOP_SECONDS);
  });

  it('runs its clock faster in a stronger wind', () => {
    const calm = new WaterWaves();
    calm.update(1, 1, 0, 0, PALETTE);
    const gale = new WaterWaves();
    gale.update(1, 1, 0, 1, PALETTE);
    expect(calm.time).toBeCloseTo(1, 9);
    expect(gale.time).toBeCloseTo(1 + WIND_TIME_SPEEDUP, 9);
  });

  it('packs the Waves uniform', () => {
    const waves = new WaterWaves();
    run(waves, 1);
    const out = new Float32Array(WAVE_UNIFORM_FLOATS);
    waves.setOrigin(1100, -2000);
    waves.pack(1.5, 1200, -2100, 2, [200, 400], [4, 8], [0, 1, 0.5, 12], out);
    // Eleven vec4 of header, two arrays of 40 vec4f, then ten vec4f of phases.
    expect(out.byteLength).toBe(176 + 640 + 640 + 160);
    expect(Array.from(out.subarray(1, 6))).toEqual([1.5, 176, -52, 1024, -2048]);
    expect(out[8]).toBe(Math.fround(waves.drag[0]));
    expect(out[19]).toBe(Math.fround(waves.variationOffset[7]));
    expect(Array.from(out.subarray(20, 24))).toEqual([0, 1, 0.5, 12]);
    expect(Array.from(out.subarray(24, 27))).toEqual([200, 400, 0]);
    expect(Array.from(out.subarray(32, 35))).toEqual([4, 8, 0]);
    expect(out[40]).toBe(2);
    const i = 5;
    expect(out[44 + i * 4 + 2]).toBe(Math.fround(waves.waves[i].k));
    expect(out[44 + WAVE_COUNT * 4 + i * 4]).toBe(Math.fround(waves.amplitudes[i * 4]));
  });
});
