import {
  GroundSlide,
  SLIDE_GRAVITY,
  slideAccel,
  slideFriction,
  slideRamp,
  uphillCancel,
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

  it('snaps further down steeper ground', () => {
    expect(slopeAt(60).snapDistance(1)).toBeGreaterThan(
      slopeAt(10).snapDistance(1)
    );
  });
});
