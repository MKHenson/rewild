import {
  BUS_NAMES,
  BusMix,
  dbToGain,
  isAudibleUnderSolo,
  isBusAncestor,
  isBusName,
} from './Buses';

describe('dbToGain', () => {
  it('maps 0 dB to unity', () => {
    expect(dbToGain(0)).toBe(1);
  });

  it('maps -12 dB to about a quarter', () => {
    expect(dbToGain(-12)).toBeCloseTo(0.251, 3);
  });

  it('maps -20 dB to a tenth', () => {
    expect(dbToGain(-20)).toBeCloseTo(0.1, 10);
  });
});

describe('isBusName', () => {
  it('accepts every bus', () => {
    for (const bus of BUS_NAMES) expect(isBusName(bus)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isBusName('drums')).toBe(false);
    expect(isBusName(undefined)).toBe(false);
    expect(isBusName(3)).toBe(false);
  });
});

describe('isBusAncestor', () => {
  it('follows the chain to master', () => {
    expect(isBusAncestor('world', 'weather')).toBe(true);
    expect(isBusAncestor('master', 'weather')).toBe(true);
    expect(isBusAncestor('master', 'ui')).toBe(true);
  });

  it('is not reflexive or reversed', () => {
    expect(isBusAncestor('world', 'world')).toBe(false);
    expect(isBusAncestor('weather', 'world')).toBe(false);
    expect(isBusAncestor('world', 'player')).toBe(false);
  });
});

describe('isAudibleUnderSolo', () => {
  it('passes everything with no solo', () => {
    for (const bus of BUS_NAMES)
      expect(isAudibleUnderSolo(bus, null)).toBe(true);
  });

  it('keeps a soloed leaf and its ancestors only', () => {
    expect(isAudibleUnderSolo('weather', 'weather')).toBe(true);
    expect(isAudibleUnderSolo('world', 'weather')).toBe(true);
    expect(isAudibleUnderSolo('master', 'weather')).toBe(true);
    expect(isAudibleUnderSolo('ambience', 'weather')).toBe(false);
    expect(isAudibleUnderSolo('player', 'weather')).toBe(false);
    expect(isAudibleUnderSolo('ui', 'weather')).toBe(false);
  });

  it('keeps the children of a soloed group', () => {
    expect(isAudibleUnderSolo('ambience', 'world')).toBe(true);
    expect(isAudibleUnderSolo('effects', 'world')).toBe(true);
    expect(isAudibleUnderSolo('music', 'world')).toBe(false);
  });
});

describe('BusMix', () => {
  it('starts every bus at unity', () => {
    const mix = new BusMix();
    for (const bus of BUS_NAMES) {
      expect(mix.gain(bus)).toBe(1);
      expect(mix.effectiveGain(bus)).toBe(1);
    }
  });

  it('clamps volume to 0..1', () => {
    const mix = new BusMix();
    mix.setVolume('master', 2);
    expect(mix.volume('master')).toBe(1);
    mix.setVolume('master', -1);
    expect(mix.volume('master')).toBe(0);
  });

  it('multiplies volumes down the chain', () => {
    const mix = new BusMix();
    mix.setVolume('master', 0.8);
    mix.setVolume('world', 0.5);
    mix.setVolume('weather', 0.5);
    expect(mix.effectiveGain('weather')).toBeCloseTo(0.2, 10);
    expect(mix.effectiveGain('ambience')).toBeCloseTo(0.4, 10);
    expect(mix.effectiveGain('player')).toBeCloseTo(0.8, 10);
  });

  it('silences a muted bus and everything under it, and keeps its volume', () => {
    const mix = new BusMix();
    mix.setVolume('world', 0.6);
    mix.setMuted('world', true);
    expect(mix.gain('world')).toBe(0);
    expect(mix.effectiveGain('weather')).toBe(0);
    expect(mix.effectiveGain('player')).toBe(1);
    mix.setMuted('world', false);
    expect(mix.gain('world')).toBe(0.6);
  });

  it('silences the buses outside a solo', () => {
    const mix = new BusMix();
    mix.solo = 'weather';
    expect(mix.effectiveGain('weather')).toBe(1);
    expect(mix.effectiveGain('ambience')).toBe(0);
    expect(mix.effectiveGain('player')).toBe(0);
    mix.solo = null;
    expect(mix.effectiveGain('ambience')).toBe(1);
  });

  it('lets a mute win over a solo', () => {
    const mix = new BusMix();
    mix.solo = 'weather';
    mix.setMuted('weather', true);
    expect(mix.effectiveGain('weather')).toBe(0);
  });
});
