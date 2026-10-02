import {
  DROP_FLOATS,
  LENS_DRY_SECONDS,
  LensDrops,
  MAX_DROPS,
  RAIN_DROPS_PER_SECOND,
  SURFACING_DROPS,
} from './LensDrops';
import {
  DEFAULT_LENS_BLUR,
  airBlurShare,
  eyeAdjust,
  followGust,
  lensRain,
  underWaterBlur,
  windBlurShare,
  windFacing,
} from './WaterLens';

// A fixed sequence, so every run lays the same drops.
function seeded(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function step(drops: LensDrops, seconds: number, frames: number) {
  for (let i = 0; i < frames; i++) drops.update(seconds / frames);
}

describe('LensDrops', () => {
  it('starts dry and takes drops on surfacing', () => {
    const drops = new LensDrops(seeded());
    expect(drops.wet).toBe(false);
    drops.surface();
    expect(drops.count).toBe(SURFACING_DROPS);
    for (let i = 0; i < drops.count; i++) {
      const o = i * DROP_FLOATS;
      expect(drops.data[o + 2]).toBeGreaterThan(0);
      expect(drops.data[o + 3]).toBeGreaterThan(0);
    }
  });

  it('is dry by the time the lens dries', () => {
    const drops = new LensDrops(seeded());
    drops.surface();
    step(drops, LENS_DRY_SECONDS + 0.1, 200);
    expect(drops.count).toBe(0);
  });

  it('loses small drops as they evaporate, before the lens is dry', () => {
    const drops = new LensDrops(seeded());
    drops.surface();
    step(drops, LENS_DRY_SECONDS * 0.7, 100);
    expect(drops.count).toBeGreaterThan(0);
    expect(drops.count).toBeLessThan(SURFACING_DROPS);
  });

  it('slides large drops down and leaves a trail above them', () => {
    const drops = new LensDrops(seeded());
    drops.surface();
    step(drops, 3.5, 60);
    let trails = 0;
    for (let i = 0; i < drops.count; i++)
      if (drops.data[i * DROP_FLOATS + 4] > 0) trails++;
    expect(trails).toBeGreaterThan(0);
  });

  it('clears when the lens goes back under', () => {
    const drops = new LensDrops(seeded());
    drops.surface();
    drops.clear();
    expect(drops.wet).toBe(false);
  });
});

describe('LensDrops in rain', () => {
  function rainFor(drops: LensDrops, strength: number, seconds: number) {
    const frames = Math.round(seconds * 60);
    for (let i = 0; i < frames; i++) {
      drops.update(1 / 60);
      drops.rain(strength, 1 / 60);
    }
  }

  it('lands about its rate of drops a second', () => {
    const drops = new LensDrops(seeded());
    rainFor(drops, 1, 1);
    expect(drops.count).toBeGreaterThanOrEqual(RAIN_DROPS_PER_SECOND - 1);
    expect(drops.count).toBeLessThanOrEqual(RAIN_DROPS_PER_SECOND + 1);
  });

  it('lands fewer drops in lighter rain', () => {
    const light = new LensDrops(seeded());
    const heavy = new LensDrops(seeded());
    rainFor(light, 0.2, 3);
    rainFor(heavy, 1, 3);
    expect(light.count).toBeGreaterThan(0);
    expect(light.count).toBeLessThan(heavy.count);
  });

  it('keeps a steady lens in steady rain, within the pool', () => {
    const drops = new LensDrops(seeded());
    rainFor(drops, 1, 20);
    expect(drops.count).toBeGreaterThan(0);
    expect(drops.count).toBeLessThanOrEqual(MAX_DROPS);
  });

  it('keeps fewer drops on a lower share', () => {
    const full = new LensDrops(seeded());
    const low = new LensDrops(seeded());
    low.setShare(0.3);
    rainFor(full, 1, 20);
    rainFor(low, 1, 20);
    expect(low.count).toBeLessThanOrEqual(Math.round(MAX_DROPS * 0.3));
    expect(low.count).toBeLessThan(full.count * 0.5);

    const surfaced = new LensDrops(seeded());
    surfaced.setShare(0.3);
    surfaced.surface();
    expect(surfaced.count).toBe(Math.round(SURFACING_DROPS * 0.3));
  });

  it('lands nothing when it is dry', () => {
    const drops = new LensDrops(seeded());
    rainFor(drops, 0, 5);
    expect(drops.wet).toBe(false);
  });
});

describe('lensRain', () => {
  it('scales with the precipitation', () => {
    expect(lensRain(0, 1)).toBe(0);
    expect(lensRain(0.5, 1)).toBeCloseTo(0.5);
    expect(lensRain(1, 1)).toBeCloseTo(1);
  });

  it('turns from snow to rain between temperatures 0 and 0.5', () => {
    expect(lensRain(1, 0)).toBe(0);
    expect(lensRain(1, 0.25)).toBeCloseTo(0.5);
    expect(lensRain(1, 0.9)).toBeCloseTo(1);
  });
});

describe('underWaterBlur', () => {
  it('ramps from the calm blur to the gale blur with the windiness', () => {
    expect(underWaterBlur(DEFAULT_LENS_BLUR, 0)).toBeCloseTo(0.003);
    expect(underWaterBlur(DEFAULT_LENS_BLUR, 0.5)).toBeCloseTo(0.0075);
    expect(underWaterBlur(DEFAULT_LENS_BLUR, 1)).toBeCloseTo(0.012);
    expect(underWaterBlur(DEFAULT_LENS_BLUR, 2)).toBeCloseTo(0.012);
  });
});

describe('airBlurShare', () => {
  it('starts full on surfacing and clears by the recovery time', () => {
    expect(airBlurShare(0, 3)).toBe(1);
    expect(airBlurShare(1.5, 3)).toBeCloseTo(0.25);
    expect(airBlurShare(3, 3)).toBe(0);
    expect(airBlurShare(Infinity, 3)).toBe(0);
  });

  it('is clear with no recovery', () => {
    expect(airBlurShare(0, 0)).toBe(0);
  });
});

describe('windBlurShare', () => {
  it('is clear below the start and full in a gale', () => {
    expect(windBlurShare(0.5, 0.8)).toBe(0);
    expect(windBlurShare(0.8, 0.8)).toBe(0);
    expect(windBlurShare(0.9, 0.8)).toBeCloseTo(0.5);
    expect(windBlurShare(1, 0.8)).toBe(1);
  });

  it('is clear when the start is past full wind', () => {
    expect(windBlurShare(1, 1)).toBe(0);
  });
});

describe('windFacing', () => {
  // Air moving toward +x: it comes from −x.
  it('is full looking into the wind and none with the wind behind', () => {
    expect(windFacing(-1, 0, 1, 0)).toBeCloseTo(1);
    expect(windFacing(1, 0, 1, 0)).toBeCloseTo(0);
  });

  it('is half across the wind, and looking straight up', () => {
    expect(windFacing(0, 1, 1, 0)).toBeCloseTo(0.5);
    expect(windFacing(0, 0, 1, 0)).toBe(0.5);
  });

  it('does not care how long the vectors are', () => {
    expect(windFacing(-0.2, 0, 3, 0)).toBeCloseTo(1);
  });
});

describe('eyeAdjust', () => {
  it('swings both ways within -1..1, and keeps moving', () => {
    let low = 1;
    let high = -1;
    for (let t = 0; t < 10; t += 0.05) {
      const e = eyeAdjust(t);
      expect(Math.abs(e)).toBeLessThanOrEqual(1);
      low = Math.min(low, e);
      high = Math.max(high, e);
    }
    expect(low).toBeLessThan(-0.6);
    expect(high).toBeGreaterThan(0.6);
  });
});

describe('gusts', () => {
  it('blur the eye quickly and let it refocus slowly', () => {
    const rising = followGust(0, 1, 0.25);
    const falling = 1 - followGust(1, 0, 0.25);
    expect(rising).toBeGreaterThan(falling);
    expect(followGust(0.3, 0.3, 1)).toBeCloseTo(0.3);
  });
});
