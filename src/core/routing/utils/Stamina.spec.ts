import {
  EXHAUSTED_RATE,
  EXHAUSTED_WAIT,
  JUMP_COST,
  JUMP_WEAKEST,
  RECOVER_AFTER,
  SPRINT_COST,
  STAMINA_FULL,
  Stamina,
  jumpShare,
} from './Stamina';

const frame = 1 / 60;

function run(stamina: Stamina, seconds: number, sprinting: boolean): void {
  for (let t = 0; t < seconds - 1e-9; t += frame)
    stamina.update(sprinting, frame);
}

describe('jumpShare', () => {
  it('is full with stamina to spare and weakest with none', () => {
    expect(jumpShare(STAMINA_FULL)).toBe(1);
    expect(jumpShare(0)).toBe(JUMP_WEAKEST);
    expect(jumpShare(10)).toBeGreaterThan(JUMP_WEAKEST);
    expect(jumpShare(10)).toBeLessThan(1);
  });
});

describe('Stamina', () => {
  it('drains while sprinting and comes back after a pause', () => {
    const stamina = new Stamina();
    run(stamina, 2, true);
    expect(stamina.value).toBeCloseTo(STAMINA_FULL - 2 * SPRINT_COST, 3);
    const spent = stamina.value;
    run(stamina, RECOVER_AFTER - 0.1, false);
    expect(stamina.value).toBe(spent);
    run(stamina, 10, false);
    expect(stamina.value).toBe(STAMINA_FULL);
  });

  it('spends some on each jump, which loses force as it runs out', () => {
    const stamina = new Stamina();
    expect(stamina.jump()).toBe(1);
    expect(stamina.value).toBe(STAMINA_FULL - JUMP_COST);
    stamina.value = 0.5;
    expect(stamina.jump()).toBeLessThan(0.5);
  });

  it('waits when exhausted, then refills fast, with no sprint until full', () => {
    const stamina = new Stamina();
    run(stamina, STAMINA_FULL / SPRINT_COST + 0.1, true);
    expect(stamina.value).toBe(0);
    expect(stamina.exhausted).toBe(true);
    expect(stamina.canSprint).toBe(false);

    run(stamina, EXHAUSTED_WAIT - 0.1, true);
    expect(stamina.value).toBe(0);

    run(stamina, 0.2 + STAMINA_FULL / EXHAUSTED_RATE / 2, false);
    expect(stamina.value).toBeGreaterThan(STAMINA_FULL * 0.4);
    expect(stamina.canSprint).toBe(false);

    run(stamina, STAMINA_FULL / EXHAUSTED_RATE, false);
    expect(stamina.value).toBe(STAMINA_FULL);
    expect(stamina.canSprint).toBe(true);
  });

  it('sets a value as if spent, exhausting the player at empty', () => {
    const stamina = new Stamina();
    stamina.set(40);
    expect(stamina.value).toBe(40);
    expect(stamina.exhausted).toBe(false);
    stamina.set(0);
    expect(stamina.value).toBe(0);
    expect(stamina.exhausted).toBe(true);
    stamina.set(STAMINA_FULL);
    expect(stamina.exhausted).toBe(false);
  });

  it('refills on reset', () => {
    const stamina = new Stamina();
    run(stamina, 20, true);
    stamina.reset();
    expect(stamina.value).toBe(STAMINA_FULL);
    expect(stamina.exhausted).toBe(false);
  });
});
