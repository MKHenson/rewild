import {
  DEFAULT_REVERB_SHAPE,
  ReverbShape,
  reverbSeconds,
  writeReverbImpulse,
} from './Reverb';

const RATE = 48000;

function impulse(shape: ReverbShape = DEFAULT_REVERB_SHAPE) {
  const length = Math.round(reverbSeconds(shape) * RATE);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  writeReverbImpulse(left, right, RATE, shape);
  return { left, right };
}

function energy(channel: Float32Array, from: number, to: number): number {
  let total = 0;
  const end = Math.min(channel.length, Math.round(to * RATE));
  for (let i = Math.round(from * RATE); i < end; i++)
    total += channel[i] * channel[i];
  return total;
}

describe('writeReverbImpulse', () => {
  const { left, right } = impulse();

  it('is silent until the predelay, so the dry sound is not doubled', () => {
    const predelay = DEFAULT_REVERB_SHAPE.predelay;
    expect(energy(left, 0, predelay)).toBe(0);
    expect(energy(right, 0, predelay)).toBe(0);
  });

  it('is as loud as its gain', () => {
    const total = energy(left, 0, 99) + energy(right, 0, 99);
    expect(Math.sqrt(total / 2)).toBeCloseTo(DEFAULT_REVERB_SHAPE.gain, 5);
  });

  it('falls by about 60 dB over its seconds', () => {
    const { predelay, seconds } = DEFAULT_REVERB_SHAPE;
    const early = energy(left, predelay + 0.1, predelay + 0.2);
    const late = energy(left, predelay + seconds - 0.1, predelay + seconds);
    expect(late / early).toBeLessThan(1e-5);
    expect(late / early).toBeGreaterThan(1e-7);
  });

  it('is different in each ear', () => {
    let same = 0;
    for (let i = 0; i < left.length; i++) if (left[i] === right[i]) same++;
    expect(same).toBeLessThan(left.length * 0.05);
  });

  it('is longer for a longer reverb', () => {
    const long = { ...DEFAULT_REVERB_SHAPE, seconds: 5 };
    expect(reverbSeconds(long)).toBeGreaterThan(
      reverbSeconds(DEFAULT_REVERB_SHAPE)
    );
  });

  it('is the same every time, with only finite numbers', () => {
    const again = impulse();
    expect(again.left).toEqual(left);
    expect(left.every(Number.isFinite)).toBe(true);
    expect(right.every(Number.isFinite)).toBe(true);
  });
});
