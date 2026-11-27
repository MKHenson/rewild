import { Vector3 } from 'rewild-common';
import { UIInput } from 'rewild-gpu-ui';
import { Transform } from 'rewild-renderer';
import {
  ARMS_HOLD,
  ARMS_LOWER,
  ARMS_RAISE,
  AssistantArms,
} from './AssistantArms';
import {
  ASSISTANT_BEAM_END,
  ASSISTANT_BREATH_RISE,
  ASSISTANT_BREATH_TIME,
  ASSISTANT_COVER,
  ASSISTANT_DISTANCE,
  ASSISTANT_HOLOGRAM_FROM,
  ASSISTANT_HOLOGRAM_TIME,
  ASSISTANT_LAYOUT_HEIGHT,
  ASSISTANT_MOVE_TIME,
  ASSISTANT_RAISE,
  ASSISTANT_SHIFT,
  ASSISTANT_WATCH,
  PersonalAssistant,
} from './PersonalAssistant';

const RAISE_TIME = 1.2;
const LOWER_TIME = 0.8;

class FakeArms implements AssistantArms {
  readonly transform = new Transform();
  readonly played: { clip: string; loop: boolean; time: number }[] = [];
  stopped = 0;
  watch = new Vector3(-0.1, -0.2, -0.3);

  clipDuration(clip: string): number {
    if (clip === ARMS_RAISE) return RAISE_TIME;
    if (clip === ARMS_LOWER) return LOWER_TIME;
    if (clip === ARMS_HOLD) return 2;
    return -1;
  }

  play(clip: string, _fade: number, loop: boolean, time: number): void {
    this.played.push({ clip, loop, time });
  }

  stop(): void {
    this.stopped++;
  }

  watchPosition(out: Vector3): boolean {
    out.copy(this.watch);
    return true;
  }
}

const assistant = (onClose = () => {}, arms: AssistantArms | null = null) =>
  new PersonalAssistant(() => null, onClose, arms);
/** Long enough for the arm and the hologram to finish. */
const ALL = Math.max(ASSISTANT_MOVE_TIME, RAISE_TIME) + ASSISTANT_HOLOGRAM_TIME;

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

  it('puts the panel and the arms on the rig only while they show', () => {
    const arms = new FakeArms();
    const pa = assistant(undefined, arms);
    expect(pa.panel.transform.parent).toBeNull();
    expect(arms.transform.parent).toBeNull();
    pa.open(50, 16 / 9);
    expect(pa.isOpen).toBe(true);
    expect(pa.panel.transform.parent).toBe(pa.rig);
    expect(arms.transform.parent).toBe(pa.rig);
  });

  it('raises the arm, holds it, then lowers it once the hologram is off', () => {
    const arms = new FakeArms();
    const pa = assistant(undefined, arms);
    pa.open(50, 1);
    expect(arms.played).toEqual([{ clip: ARMS_RAISE, loop: false, time: 0 }]);

    pa.update(RAISE_TIME * 0.5);
    expect(arms.played).toHaveLength(1);
    pa.update(RAISE_TIME * 0.6);
    expect(arms.played[1]).toEqual({ clip: ARMS_HOLD, loop: true, time: 0 });

    pa.update(ASSISTANT_HOLOGRAM_TIME);
    pa.close();
    pa.update(ASSISTANT_HOLOGRAM_TIME / 2);
    expect(arms.played).toHaveLength(2);
    pa.update(ASSISTANT_HOLOGRAM_TIME);
    expect(arms.played[2]).toEqual({ clip: ARMS_LOWER, loop: false, time: 0 });

    pa.update(LOWER_TIME * 0.5);
    expect(arms.transform.parent).toBe(pa.rig);
    pa.update(LOWER_TIME);
    expect(arms.stopped).toBe(1);
    expect(arms.transform.parent).toBeNull();
    expect(pa.panel.transform.parent).toBeNull();
  });

  it('raises the arm from where it is when opened as it goes down', () => {
    const arms = new FakeArms();
    const pa = assistant(undefined, arms);
    pa.open(50, 1);
    pa.update(ALL);
    pa.close();
    pa.update(ASSISTANT_HOLOGRAM_TIME);
    pa.update(LOWER_TIME / 4);
    pa.open(50, 1);
    const last = arms.played[arms.played.length - 1];
    expect(last.clip).toBe(ARMS_RAISE);
    expect(last.time).toBeCloseTo(RAISE_TIME * 0.75);
  });

  it('keeps the arm up when opened as the hologram turns off', () => {
    const arms = new FakeArms();
    const pa = assistant(undefined, arms);
    pa.open(50, 1);
    pa.update(ALL);
    pa.close();
    pa.update(ASSISTANT_HOLOGRAM_TIME / 2);
    pa.open(50, 1);
    expect(arms.played[arms.played.length - 1].clip).toBe(ARMS_HOLD);
  });

  it('brings the panel out of the watch as the hologram opens', () => {
    const arms = new FakeArms();
    const pa = assistant(undefined, arms);
    pa.open(50, 1);
    pa.update(RAISE_TIME * ASSISTANT_HOLOGRAM_FROM * 0.9);
    expect(pa.panel.transform.position.distanceTo(arms.watch)).toBeCloseTo(0);

    pa.update(RAISE_TIME * ASSISTANT_HOLOGRAM_FROM * 0.1);
    pa.update(ASSISTANT_HOLOGRAM_TIME * ASSISTANT_BEAM_END * 0.5);
    const between = pa.panel.transform.position;
    expect(between.y).toBeGreaterThan(arms.watch.y);

    pa.update(ALL);
    const viewHeight = 2 * ASSISTANT_DISTANCE * Math.tan((25 * Math.PI) / 180);
    const { x, y, z } = pa.panel.transform.position;
    expect(x).toBeCloseTo(viewHeight * ASSISTANT_SHIFT);
    expect(y).toBeCloseTo(viewHeight * ASSISTANT_RAISE);
    expect(z).toBeCloseTo(-ASSISTANT_DISTANCE);
  });

  it('opens from the usual watch place with no arms', () => {
    const pa = assistant();
    pa.open(50, 1);
    pa.update(ASSISTANT_MOVE_TIME * ASSISTANT_HOLOGRAM_FROM * 0.9);
    expect(
      pa.panel.transform.position.distanceTo(ASSISTANT_WATCH)
    ).toBeCloseTo(0);
  });

  it('rises and falls with each breath while it is raised', () => {
    const pa = assistant();
    pa.open(50, 1);
    pa.update(ALL);
    const heights: number[] = [];
    for (let i = 0; i < 40; i++) {
      pa.update(ASSISTANT_BREATH_TIME / 40);
      heights.push(pa.rig.position.y);
    }
    const rise = Math.max(...heights) - Math.min(...heights);
    expect(rise).toBeGreaterThan(ASSISTANT_BREATH_RISE * 1.9);
    expect(rise).toBeLessThanOrEqual(ASSISTANT_BREATH_RISE * 2 + 1e-9);
  });

  it('keeps the rig on the camera when it closes', () => {
    const camera = new Transform();
    const pa = assistant();
    camera.addChild(pa.rig);
    pa.open(50, 1);
    pa.update(ALL);
    pa.close();
    for (let i = 0; i < 3; i++) pa.update(ALL);
    expect(pa.panel.transform.parent).toBeNull();
    expect(pa.rig.parent).toBe(camera);
  });

  it('turns the hologram on once the arm is part way up', () => {
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

  it('hides at once, with no move', () => {
    const arms = new FakeArms();
    const pa = assistant(undefined, arms);
    pa.open(50, 1);
    pa.update(ALL);
    pa.hide();
    expect(pa.panel.surface.effectValue).toBe(0);
    expect(pa.isOpen).toBe(false);
    expect(pa.panel.transform.parent).toBeNull();
    expect(arms.transform.parent).toBeNull();
    expect(arms.stopped).toBe(1);
  });

  it('covers part of the view, at any field of view and aspect', () => {
    const pa = assistant();
    pa.open(60, 2);
    const viewHeight = 2 * ASSISTANT_DISTANCE * Math.tan(Math.PI / 6);
    const { size, layoutHeight } = pa.panel.surface;
    expect(size.height).toBeCloseTo(viewHeight * ASSISTANT_COVER);
    expect(size.width).toBeCloseTo(viewHeight * 2 * ASSISTANT_COVER);
    expect(layoutHeight).toBeCloseTo(ASSISTANT_LAYOUT_HEIGHT);
  });
});
