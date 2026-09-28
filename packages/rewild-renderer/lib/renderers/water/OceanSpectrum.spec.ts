import { LAKE, OCEAN } from '../terrain/Water';
import {
  CALM_WIND_SPEED,
  CASCADE_COUNT,
  CASCADE_SIZES,
  FFT_SIZE,
  CALM_CHOPPINESS,
  GALE_WIND_SPEED,
  ROUGH_CHOPPINESS,
  ROUGH_HEIGHT_GAIN,
  ROUGH_OMNI_SHARE,
  cascadeBand,
  cascadeWeight,
  jonswapShape,
  oceanWindSpeed,
  seaState,
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

  it('holds the peak no longer than the longest peak wavelength', () => {
    const { peakOmega } = jonswapShape(GALE_WIND_SPEED, 200, 90);
    const wavelength = (Math.PI * 2 * 9.81) / (peakOmega * peakOmega);
    expect(wavelength).toBeCloseTo(90, 6);
    // A short peak is left as it is.
    expect(jonswapShape(4, 120, 90).peakOmega).toBe(jonswapShape(4, 120).peakOmega);
  });

  it('roughens the wind sea from calm to a full wind', () => {
    const calm = seaState(0);
    const rough = seaState(1);
    expect(calm.heightGain).toBe(1);
    expect(calm.omniShare).toBe(0);
    expect(calm.choppiness).toBe(CALM_CHOPPINESS);
    expect(rough.heightGain).toBe(ROUGH_HEIGHT_GAIN);
    expect(rough.omniShare).toBe(ROUGH_OMNI_SHARE);
    expect(rough.choppiness).toBe(ROUGH_CHOPPINESS);
    expect(rough.windSpeed).toBe(GALE_WIND_SPEED);
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
