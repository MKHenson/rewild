import {
  GroundSlide,
  IMPACT_HURT_FROM,
  IMPACT_HURT_SCALE,
  SLIDE_GRAVITY,
  SLIDE_HURT_FROM,
  SLIDE_HURT_RATE,
  SLIDE_MAX_SPEED,
  slideAccel,
  impactDamage,
  slideDamage,
  slideFriction,
  slideRamp,
  uphillCancel,
  walkCatchUp,
} from './Sliding';

const normalYAt = (degrees: number) => Math.cos((degrees * Math.PI) / 180);

describe('slideRamp', () => {
  it('leaves gentle ground alone', () => {
    expect(slideRamp(1)).toBe(0);
    expect(slideRamp(normalYAt(30))).toBe(0);
  });

  it('ramps up between 35 and 45 degrees', () => {
    const mid = slideRamp(normalYAt(40));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(slideRamp(normalYAt(45.01))).toBe(1);
    expect(slideRamp(normalYAt(70))).toBe(1);
  });
});

describe('slideAccel', () => {
  it('is zero on gentle ground', () => {
    expect(slideAccel(normalYAt(20))).toBe(0);
  });

  it('pulls harder the steeper the slope', () => {
    expect(slideAccel(normalYAt(60))).toBeGreaterThan(
      slideAccel(normalYAt(46))
    );
    expect(slideAccel(normalYAt(60))).toBeCloseTo(
      SLIDE_GRAVITY * Math.sin((60 * Math.PI) / 180)
    );
  });
});

describe('slideFriction', () => {
  it('bleeds a slide off on gentle ground', () => {
    expect(slideFriction(10, 0, 1)).toBeLessThan(1);
  });

  it('keeps a slide going on a full slope', () => {
    expect(slideFriction(10, 1, 1)).toBe(10);
  });

  it('bleeds a slide off slower on slippery ground', () => {
    expect(slideFriction(10, 0, 1, 1)).toBeGreaterThan(5);
    expect(slideFriction(10, 0, 1, 1)).toBeLessThan(10);
  });
});

describe('impactDamage', () => {
  it('does no harm below IMPACT_HURT_FROM', () => {
    expect(impactDamage(0)).toBe(0);
    expect(impactDamage(IMPACT_HURT_FROM)).toBe(0);
  });

  it('hurts by the speed above it', () => {
    expect(impactDamage(IMPACT_HURT_FROM + 2)).toBe(2 * IMPACT_HURT_SCALE);
    expect(impactDamage(SLIDE_MAX_SPEED)).toBeGreaterThan(30);
  });
});

describe('slippery ground', () => {
  it('starts a slide on gentler slopes', () => {
    expect(slideRamp(normalYAt(32))).toBe(0);
    expect(slideRamp(normalYAt(32), 1)).toBeGreaterThan(0);
    expect(slideAccel(normalYAt(32), 1)).toBeGreaterThan(0);
    expect(slideRamp(normalYAt(45), 1)).toBe(1);
  });

  it('takes the harm out of a slide', () => {
    expect(slideDamage(SLIDE_MAX_SPEED, 1, 1)).toBe(0);
    expect(slideDamage(SLIDE_MAX_SPEED, 1, 0.5)).toBe(SLIDE_HURT_RATE / 2);
  });

  it('lets walking catch up at once with grip, slowly without', () => {
    expect(walkCatchUp(0, 1 / 60)).toBe(1);
    expect(walkCatchUp(1, 1 / 60)).toBeLessThan(0.1);
    expect(walkCatchUp(0.2, 1 / 60)).toBeGreaterThan(walkCatchUp(1, 1 / 60));
  });
});

// Downhill toward +x.
describe('uphillCancel', () => {
  it('cancels walking straight up a full slope', () => {
    expect(uphillCancel(-2, 0, 1, 0, 1)).toBeCloseTo(2);
  });

  it('leaves walking across or down the slope alone', () => {
    expect(uphillCancel(0, 2, 1, 0, 1)).toBe(0);
    expect(uphillCancel(2, 0, 1, 0, 1)).toBe(0);
  });

  it('only cancels the uphill share of a diagonal', () => {
    expect(uphillCancel(-1, 1, 1, 0, 1)).toBeCloseTo(1);
  });

  it('scales with the ramp', () => {
    expect(uphillCancel(-2, 0, 1, 0, 0.5)).toBeCloseTo(1);
  });
});

// A slope falling away toward +x at `degrees`.
const slopeAt = (degrees: number) => {
  const slide = new GroundSlide();
  const a = (degrees * Math.PI) / 180;
  slide.normalX = Math.sin(a);
  slide.normalY = Math.cos(a);
  return slide;
};

describe('slideDamage', () => {
  it('does no harm below SLIDE_HURT_FROM', () => {
    expect(slideDamage(0, 1)).toBe(0);
    expect(slideDamage(SLIDE_HURT_FROM, 1)).toBe(0);
  });

  it('hurts more the faster the slide, up to SLIDE_HURT_RATE a second', () => {
    const mid = (SLIDE_HURT_FROM + SLIDE_MAX_SPEED) / 2;
    expect(slideDamage(mid, 1)).toBeGreaterThan(0);
    expect(slideDamage(mid, 1)).toBeLessThan(SLIDE_HURT_RATE);
    expect(slideDamage(SLIDE_MAX_SPEED, 1)).toBe(SLIDE_HURT_RATE);
    expect(slideDamage(SLIDE_MAX_SPEED, 0.5)).toBe(SLIDE_HURT_RATE / 2);
  });

  it('kills in a long slide down a steep face', () => {
    let health = 100;
    for (let t = 0; t < 6; t += 1 / 60)
      health -= slideDamage(SLIDE_MAX_SPEED, 1 / 60);
    expect(health).toBeLessThanOrEqual(0);
  });
});

describe('GroundSlide', () => {
  it('passes walking input through on gentle ground', () => {
    const slide = slopeAt(20);
    slide.step(-1, 0.5, true, true, 0.1, 0.05);
    expect(slide.moveX).toBe(-1);
    expect(slide.moveZ).toBe(0.5);
    expect(slide.walkable).toBe(true);
  });

  it('carries the player downhill on steep ground', () => {
    const slide = slopeAt(60);
    slide.step(0, 0, true, true, 0.1, 0.05);
    expect(slide.velocityX).toBeGreaterThan(0);
    expect(slide.moveX).toBeGreaterThan(0);
    expect(slide.walkable).toBe(false);
  });

  it('stops the player walking up steep ground', () => {
    const slide = slopeAt(60);
    slide.step(-1, 0, true, true, 0.1, 0.05);
    expect(slide.moveX).toBeGreaterThanOrEqual(0);
  });

  it('says when it holds back a climb up a sliding slope', () => {
    const slide = slopeAt(60);
    slide.step(-1, 0, true, true, 0.1, 0.05);
    expect(slide.climbing).toBe(true);
    slide.step(1, 0, true, true, 0.1, 0.05);
    expect(slide.climbing).toBe(false);
    slide.step(-1, 0, false, true, 0.1, 0.05);
    expect(slide.climbing).toBe(false);
    const gentle = slopeAt(20);
    gentle.step(-1, 0, true, true, 0.1, 0.05);
    expect(gentle.climbing).toBe(false);
  });

  it('keeps its momentum in the air', () => {
    const slide = slopeAt(60);
    slide.step(0, 0, true, true, 0.1, 0.05);
    const speed = slide.velocityX;
    slide.reset();
    slide.velocityX = speed;
    slide.step(0, 0, false, true, 0.1, 0.05);
    expect(slide.velocityX).toBe(speed);
  });

  it('skids to a stop on flat ground', () => {
    const slide = new GroundSlide();
    slide.velocityX = 5;
    for (let i = 0; i < 120; i++) slide.step(0, 0, true, true, 1 / 30, 1 / 60);
    expect(slide.velocityX).toBeLessThan(0.1);
  });

  it('stops when inactive', () => {
    const slide = new GroundSlide();
    slide.velocityX = 5;
    slide.step(0, 0, true, false, 0.1, 0.05);
    expect(slide.velocityX).toBe(0);
  });

  it('walks as the keys say on ground with grip', () => {
    const slide = new GroundSlide();
    slide.step(1, 0, true, true, 0.1, 0.05);
    slide.step(0, 0, true, true, 0.1, 0.05);
    expect(slide.moveX).toBe(0);
  });

  it('skids to a stop on slippery ground', () => {
    const slide = new GroundSlide();
    for (let i = 0; i < 400; i++) slide.step(1, 0, true, true, 0.1, 0.05, 1);
    expect(slide.moveX).toBeCloseTo(1);
    slide.step(0, 0, true, true, 0.1, 0.05, 1);
    expect(slide.moveX).toBeGreaterThan(0.8);
    for (let i = 0; i < 400; i++) slide.step(0, 0, true, true, 0.1, 0.05, 1);
    expect(slide.moveX).toBeLessThan(0.01);
  });

  it('turns in the air as the keys say, slippery ground or not', () => {
    const slide = new GroundSlide();
    for (let i = 0; i < 400; i++) slide.step(1, 0, true, true, 0.1, 0.05, 1);
    slide.step(0, 1, false, true, 0.1, 0.05, 1);
    expect(slide.moveX).toBe(0);
    expect(slide.moveZ).toBe(1);
  });

  it('cannot skate up a slippery slope too steep to climb', () => {
    const slide = slopeAt(60);
    slide.normalX = -slide.normalX;
    slide.walkX = 10;
    slide.step(1, 0, true, true, 0.1, 0.05, 1);
    expect(slide.moveX).toBeLessThanOrEqual(0);
  });

  it('loses the slide into an obstacle that stops it dead', () => {
    const slide = new GroundSlide();
    slide.velocityX = 10;
    slide.velocityZ = 0;
    const impact = slide.collide(1, 0, 0, 0, 0.1);
    expect(impact).toBe(10);
    expect(slide.velocityX).toBe(0);
  });

  it('keeps the slide along an obstacle it glances off', () => {
    const slide = new GroundSlide();
    slide.velocityX = 6;
    slide.velocityZ = 8;
    const impact = slide.collide(0.6, 0.8, 0, 0.8, 0.1);
    expect(impact).toBeCloseTo(6);
    expect(slide.velocityX).toBeCloseTo(0);
    expect(slide.velocityZ).toBeCloseTo(8);
  });

  it('takes a skid into an obstacle out too, with no impact', () => {
    const slide = new GroundSlide();
    slide.walkX = 5;
    expect(slide.collide(0.5, 0, 0, 0, 0.1)).toBe(0);
    expect(slide.walkX).toBe(0);
  });

  it('leaves an unblocked move alone', () => {
    const slide = new GroundSlide();
    slide.velocityX = 10;
    expect(slide.collide(1, 0, 1, 0, 0.1)).toBe(0);
    expect(slide.collide(1, 0, 1 - 1e-4, 0, 0.1)).toBe(0);
    expect(slide.velocityX).toBe(10);
  });

  it('does not push a slide away from what blocks it', () => {
    const slide = new GroundSlide();
    slide.velocityX = -10;
    expect(slide.collide(1, 0, 0, 0, 0.1)).toBe(0);
    expect(slide.velocityX).toBe(-10);
  });

  it('forgets a skid on reset', () => {
    const slide = new GroundSlide();
    slide.step(1, 0, true, true, 0.1, 0.05, 1);
    slide.reset();
    expect(slide.walkX).toBe(0);
  });

  it('snaps further down steeper ground', () => {
    expect(slopeAt(60).snapDistance(1)).toBeGreaterThan(
      slopeAt(10).snapDistance(1)
    );
  });
});
