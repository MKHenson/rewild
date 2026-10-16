import {
  BREATH,
  BURST_AT,
  CLOSED_SCALE,
  CLOSE_RANGE,
  OPEN_RANGE,
  PortalOpening,
  PortalOpeningEvent,
} from './PortalOpening';

const RADIUS = 3;
const NEAR = RADIUS * OPEN_RANGE - 1;
const BETWEEN = RADIUS * (OPEN_RANGE + CLOSE_RANGE) * 0.5;
const FAR = RADIUS * CLOSE_RANGE + 1;
const STEP = 1 / 60;

function run(opening: PortalOpening, seconds: number, distance: number) {
  const events: PortalOpeningEvent[] = [];
  for (let t = 0; t < seconds; t += STEP) {
    const event = opening.update(STEP, distance, RADIUS);
    if (event !== 'none') events.push(event);
  }
  return events;
}

describe('PortalOpening', () => {
  it('starts closed, small, and stays so while the player is far', () => {
    const opening = new PortalOpening(false);
    expect(run(opening, 2, FAR)).toEqual([]);
    expect(opening.openness).toBe(0);
    expect(opening.scale).toBeCloseTo(CLOSED_SCALE);
  });

  it('starts open at full size when asked', () => {
    const opening = new PortalOpening(true);
    expect(opening.isOpen).toBe(true);
    expect(opening.scale).toBeCloseTo(1);
    expect(opening.bob).toBe(0);
  });

  it('opens as the player nears, bursting part way', () => {
    const opening = new PortalOpening(false);
    expect(run(opening, 5, NEAR)).toEqual(['opening', 'burst']);
    expect(opening.isOpen).toBe(true);
    expect(Math.abs(opening.scale - 1)).toBeLessThanOrEqual(BREATH);
  });

  it('bursts once openness passes BURST_AT', () => {
    const opening = new PortalOpening(false);
    let burstAt = -1;
    for (let t = 0; t < 5 && burstAt < 0; t += STEP)
      if (opening.update(STEP, NEAR, RADIUS) === 'burst')
        burstAt = opening.openness;
    expect(burstAt).toBeGreaterThanOrEqual(BURST_AT);
    expect(burstAt).toBeLessThan(BURST_AT + 0.05);
  });

  it('closes as the player leaves, and not before they are past the close range', () => {
    const opening = new PortalOpening(true);
    expect(run(opening, 2, BETWEEN)).toEqual([]);
    expect(opening.isOpen).toBe(true);

    expect(run(opening, 5, FAR)).toEqual(['closing']);
    expect(opening.openness).toBe(0);
  });

  it('is changing only part way between closed and open', () => {
    const opening = new PortalOpening(false);
    expect(opening.isChanging).toBe(false);
    run(opening, 1, NEAR);
    expect(opening.isChanging).toBe(true);
    run(opening, 5, NEAR);
    expect(opening.isChanging).toBe(false);
    run(opening, 1, FAR);
    expect(opening.isChanging).toBe(true);
  });

  it('bobs while closed and stills as it opens', () => {
    const closed = new PortalOpening(false);
    let most = 0;
    for (let t = 0; t < 3; t += STEP) {
      closed.update(STEP, FAR, RADIUS);
      most = Math.max(most, Math.abs(closed.bob));
    }
    expect(most).toBeGreaterThan(0);

    const open = new PortalOpening(false);
    run(open, 5, NEAR);
    expect(open.bob).toBeCloseTo(0);
  });

  it('breathes in and out by BREATH once open', () => {
    const opening = new PortalOpening(false);
    run(opening, 5, NEAR);
    let least = Infinity;
    let most = 0;
    for (let t = 0; t < 5; t += STEP) {
      opening.update(STEP, NEAR, RADIUS);
      least = Math.min(least, opening.scale);
      most = Math.max(most, opening.scale);
    }
    expect(most).toBeCloseTo(1 + BREATH, 2);
    expect(least).toBeCloseTo(1 - BREATH, 2);
  });
});
