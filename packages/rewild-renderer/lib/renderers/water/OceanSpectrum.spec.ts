import { LAKE, OCEAN } from '../terrain/Water';
import {
  CALM_WIND_SPEED,
  CASCADE_COUNT,
  CASCADE_SIZES,
  FFT_SIZE,
  GALE_WIND_SPEED,
  cascadeBand,
  cascadeWeight,
  jonswapShape,
  oceanWindSpeed,
} from './OceanSpectrum';

describe('OceanSpectrum', () => {
  it('raises the wind speed with the weather', () => {
    expect(oceanWindSpeed(0)).toBe(CALM_WIND_SPEED);
    expect(oceanWindSpeed(1)).toBe(GALE_WIND_SPEED);
    expect(oceanWindSpeed(2)).toBe(GALE_WIND_SPEED);
  });

  it('peaks at longer waves in a stronger wind and over a longer fetch', () => {
    const breeze = jonswapShape(4, 120);
    const gale = jonswapShape(12, 120);
    expect(gale.peakOmega).toBeLessThan(breeze.peakOmega);
    expect(jonswapShape(8, 1200).peakOmega).toBeLessThan(jonswapShape(8, 10).peakOmega);
    // A developed sea at 10 m/s peaks near 60 to 100 m.
    const { peakOmega } = jonswapShape(10, 120);
    const k = (peakOmega * peakOmega) / 9.81;
    const wavelength = (Math.PI * 2) / k;
    expect(wavelength).toBeGreaterThan(40);
    expect(wavelength).toBeLessThan(150);
  });

  it('gives every wavenumber to exactly one cascade', () => {
    for (let c = 0; c < CASCADE_COUNT - 1; c++)
      expect(cascadeBand(c)[1]).toBe(cascadeBand(c + 1)[0]);
    expect(cascadeBand(0)[0]).toBeLessThan((Math.PI * 2) / CASCADE_SIZES[0]);
  });

  it('holds each band in its cascade, above one cycle and below Nyquist', () => {
    for (let c = 0; c < CASCADE_COUNT; c++) {
      const [low, high] = cascadeBand(c);
      const size = CASCADE_SIZES[c];
      const nyquist = (Math.PI * FFT_SIZE) / size;
      if (c > 0) expect(low).toBeGreaterThan((Math.PI * 2) / size);
      if (c < CASCADE_COUNT - 1) expect(high).toBeLessThan(nyquist);
    }
  });

  it('keeps a lake to the short cascades and the ocean to all', () => {
    for (const size of CASCADE_SIZES)
      expect(cascadeWeight(OCEAN, size)).toBeCloseTo(OCEAN.waveResponse, 9);
    expect(cascadeWeight(LAKE, CASCADE_SIZES[0])).toBe(0);
    expect(cascadeWeight(LAKE, CASCADE_SIZES[3])).toBeCloseTo(LAKE.waveResponse, 9);
  });
});
