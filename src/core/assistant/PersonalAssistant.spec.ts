import { UIInput } from 'rewild-gpu-ui';
import { Transform } from 'rewild-renderer';
import {
  ASSISTANT_BREATH_DRIFT,
  ASSISTANT_BREATH_RISE,
  ASSISTANT_BREATH_TIME,
  ASSISTANT_COVER,
  ASSISTANT_DISTANCE,
  ASSISTANT_LAYOUT_HEIGHT,
  ASSISTANT_MOVE_TIME,
  ASSISTANT_HOLOGRAM_FROM,
  ASSISTANT_HOLOGRAM_TIME,
  PersonalAssistant,
} from './PersonalAssistant';

const assistant = (onClose = () => {}) =>
  new PersonalAssistant(() => null, onClose);
/** Long enough for the hand and the hologram to finish. */
const ALL = ASSISTANT_MOVE_TIME + ASSISTANT_HOLOGRAM_TIME;

describe('PersonalAssistant', () => {
  it('draws its panel over the scene, as a hologram', () => {
    const { surface } = assistant().panel;
    expect(surface.depthTest).toBe(false);
    expect(surface.effect).toBe('hologram');
  });

  it('takes pointer input only while it is all the way open', () => {
    const pa = assistant();
    expect(pa.panel.surface.input).toBe('none');
    pa.open(50, 1);
    pa.update(ASSISTANT_MOVE_TIME / 2);
    expect(pa.panel.surface.input).toBe('none');
    pa.update(ALL);
    expect(pa.panel.surface.input).toBe('nodes');
    pa.close();
    pa.update(ASSISTANT_HOLOGRAM_TIME * 0.1);
    expect(pa.panel.surface.input).toBe('none');
  });

  it('has a Close button that calls onClose', () => {
    let closed = 0;
    const pa = assistant(() => closed++);
    expect(pa.closeButton.text).toBe('Close');
    expect(pa.glass.children).toContain(pa.closeButton.node);
    pa.closeButton.onClick!();
    expect(closed).toBe(1);
  });

  it('lights its glass where a ray points at it', () => {
    const pa = assistant();
    const { surface } = pa.panel;
    expect(surface.root.children).toEqual([pa.glass]);
    pa.open(50, 1);
    pa.update(ALL);
    surface.worldMatrix.makeTranslation(0, 0, -ASSISTANT_DISTANCE);
    surface.update(surface.layoutWidth, surface.layoutHeight);
    const input = new UIInput({ surfaces: [surface] });
    // A ray through the panel's centre.
    input.ray('move', {
      pointerId: -3,
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 0, z: -1 },
      reach: 3,
    });
    const [x, y, strength] = pa.glass.effectParams;
    expect(x).toBeCloseTo(0.5);
    expect(y).toBeCloseTo(0.5);
    expect(strength).toBe(1);
  });

  it('has one tab, Portal, in a column', () => {
    const { tabs, portalTab } = assistant();
    expect(tabs.panels).toHaveLength(1);
    expect(tabs.panels[0].children).toContain(portalTab.node);
  });

  it('puts the panel on the hand only while it is open', () => {
    const pa = assistant();
    expect(pa.panel.transform.parent).toBeNull();
    pa.open(50, 16 / 9);
    expect(pa.isOpen).toBe(true);
    expect(pa.panel.transform.parent).toBe(pa.hand);
  });

  it('brings the hand up from the side to in front of the eye', () => {
    const pa = assistant();
    const rest = pa.hand.position.clone();
    expect(rest.x).toBeGreaterThan(0);
    expect(rest.y).toBeLessThan(0);

    pa.open(50, 1);
    pa.update(ASSISTANT_MOVE_TIME / 2);
    const half = pa.hand.position.clone();
    expect(half.y).toBeGreaterThan(rest.y);
    expect(half.y).toBeLessThan(0);

    pa.update(ASSISTANT_MOVE_TIME);
    // In front of the eye, give or take its breathing.
    const { x, y, z } = pa.hand.position;
    expect(Math.abs(x)).toBeLessThanOrEqual(ASSISTANT_BREATH_DRIFT + 1e-9);
    expect(Math.abs(y)).toBeLessThanOrEqual(ASSISTANT_BREATH_RISE + 1e-9);
    expect(z).toBeCloseTo(-ASSISTANT_DISTANCE);
    expect(pa.hand.quaternion.w).toBeCloseTo(1);
  });

  it('rises and falls with each breath while it is raised', () => {
    const pa = assistant();
    pa.open(50, 1);
    pa.update(ALL);
    const heights: number[] = [];
    for (let i = 0; i < 40; i++) {
      pa.update(ASSISTANT_BREATH_TIME / 40);
      heights.push(pa.hand.position.y);
    }
    const rise = Math.max(...heights) - Math.min(...heights);
    expect(rise).toBeGreaterThan(ASSISTANT_BREATH_RISE * 1.9);
    expect(rise).toBeLessThanOrEqual(ASSISTANT_BREATH_RISE * 2 + 1e-9);
  });

  it('takes the panel out of the scene once the hand is down', () => {
    const camera = new Transform();
    const pa = assistant();
    camera.addChild(pa.hand);
    pa.open(50, 1);
    pa.update(ALL);

    pa.close();
    expect(pa.isOpen).toBe(false);
    pa.update(ALL / 2);
    expect(pa.panel.transform.parent).toBe(pa.hand);
    for (let i = 0; i < 3; i++) pa.update(ALL);
    expect(pa.panel.transform.parent).toBeNull();
    expect(pa.hand.parent).toBe(camera);
  });

  it('turns the hologram on once the hand is part way up', () => {
    const pa = assistant();
    expect(pa.panel.surface.effectValue).toBe(0);
    pa.open(50, 1);
    pa.update(ASSISTANT_MOVE_TIME * ASSISTANT_HOLOGRAM_FROM * 0.9);
    expect(pa.panel.surface.effectValue).toBe(0);
    pa.update(ASSISTANT_MOVE_TIME * ASSISTANT_HOLOGRAM_FROM * 0.2);
    // The step that passes the start also turns the hologram a little.
    const started = pa.panel.surface.effectValue;
    expect(started).toBeGreaterThan(0);
    pa.update(ASSISTANT_HOLOGRAM_TIME / 2);
    expect(pa.panel.surface.effectValue).toBeCloseTo(started + 0.5);
    pa.update(ASSISTANT_HOLOGRAM_TIME);
    expect(pa.panel.surface.effectValue).toBe(1);
  });

  it('turns the hologram off before the hand goes down', () => {
    const pa = assistant();
    pa.open(50, 1);
    pa.update(ALL);
    const up = pa.hand.position.clone();

    pa.close();
    pa.update(ASSISTANT_HOLOGRAM_TIME / 2);
    expect(pa.panel.surface.effectValue).toBeCloseTo(0.5);
    // Still raised. It only breathes.
    expect(pa.hand.position.z).toBeCloseTo(up.z);
    expect(Math.abs(pa.hand.position.y - up.y)).toBeLessThanOrEqual(
      ASSISTANT_BREATH_RISE * 2 + 1e-9
    );
    pa.update(ASSISTANT_HOLOGRAM_TIME / 2);
    expect(pa.panel.surface.effectValue).toBe(0);
    pa.update(ASSISTANT_MOVE_TIME / 2);
    expect(pa.hand.position.y).toBeLessThan(up.y);
  });

  it('hides at once, with no move', () => {
    const pa = assistant();
    pa.open(50, 1);
    pa.update(ALL);
    pa.hide();
    expect(pa.panel.surface.effectValue).toBe(0);
    expect(pa.isOpen).toBe(false);
    expect(pa.panel.transform.parent).toBeNull();
    expect(pa.hand.position.y).toBeLessThan(0);
  });

  it('covers most of the view, at any field of view and aspect', () => {
    const pa = assistant();
    pa.open(60, 2);
    const viewHeight = 2 * ASSISTANT_DISTANCE * Math.tan(Math.PI / 6);
    const { size, layoutHeight } = pa.panel.surface;
    expect(size.height).toBeCloseTo(viewHeight * ASSISTANT_COVER);
    expect(size.width).toBeCloseTo(viewHeight * 2 * ASSISTANT_COVER);
    expect(layoutHeight).toBeCloseTo(ASSISTANT_LAYOUT_HEIGHT);
  });
});
