import {
  DROWN_DAMAGE,
  OXYGEN_FULL,
  OXYGEN_RECOVER,
  OXYGEN_USE,
  Oxygen,
} from './Oxygen';

const frame = 1 / 60;

function run(oxygen: Oxygen, seconds: number, under: boolean): number {
  let damage = 0;
  for (let t = 0; t < seconds - 1e-9; t += frame)
    damage += oxygen.update(under, frame);
  return damage;
}

describe('Oxygen', () => {
  it('runs down under water and does no harm while there is air', () => {
    const oxygen = new Oxygen();
    expect(run(oxygen, 10, true)).toBe(0);
    expect(oxygen.value).toBeCloseTo(OXYGEN_FULL - 10 * OXYGEN_USE, 3);
    expect(oxygen.drowning).toBe(false);
  });

  it('refills slowly above water', () => {
    const oxygen = new Oxygen();
    run(oxygen, 15, true);
    const low = oxygen.value;
    run(oxygen, 1, false);
    expect(oxygen.value).toBeCloseTo(low + OXYGEN_RECOVER, 3);
    run(oxygen, OXYGEN_FULL / OXYGEN_RECOVER, false);
    expect(oxygen.value).toBe(OXYGEN_FULL);
  });

  it('drowns once the air runs out, from the moment it does', () => {
    const oxygen = new Oxygen();
    const damage = run(oxygen, OXYGEN_FULL / OXYGEN_USE + 2, true);
    expect(oxygen.drowning).toBe(true);
    expect(damage).toBeCloseTo(2 * DROWN_DAMAGE, 0);
  });

  it('stops drowning on surfacing, and refills on reset', () => {
    const oxygen = new Oxygen();
    run(oxygen, 40, true);
    expect(oxygen.update(false, frame)).toBe(0);
    expect(oxygen.drowning).toBe(false);
    oxygen.reset();
    expect(oxygen.value).toBe(OXYGEN_FULL);
  });
});
