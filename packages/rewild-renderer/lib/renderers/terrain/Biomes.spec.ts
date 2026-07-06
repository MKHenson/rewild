import {
  CLIMATE_PRESETS,
  DEFAULT_CLIMATE,
  DEFAULT_CLIMATE_PRESET,
  resolveClimatePreset,
} from './Biomes';

describe('resolveClimatePreset', () => {
  it('resolves a known preset id', () => {
    expect(resolveClimatePreset(DEFAULT_CLIMATE_PRESET)).toBe(DEFAULT_CLIMATE);
  });

  it('falls back to the default preset when the id is missing', () => {
    expect(resolveClimatePreset(undefined)).toBe(
      CLIMATE_PRESETS[DEFAULT_CLIMATE_PRESET]
    );
  });

  it('falls back to the default preset for an unknown id, with a warning', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveClimatePreset('no-such-era')).toBe(DEFAULT_CLIMATE);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
