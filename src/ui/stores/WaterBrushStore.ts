import { Dispatcher } from 'rewild-common';

export type WaterBrushStoreEvents = { kind: 'changed' };

// Level picks a lake and drags its level up or down; type paints palette
// weights over the water there; add paints water and digs its bed; remove
// hands the water and the ground back to the generator.
export type WaterBrushType = 'level' | 'type' | 'add' | 'remove';

export const WATER_BRUSH_RADIUS_MIN = 8;
export const WATER_BRUSH_RADIUS_MAX = 200;
export const WATER_BRUSH_DEPTH_MIN = 0.25;
export const WATER_BRUSH_DEPTH_MAX = 10;

// Editor water brush: whether the tool is armed, how the brush is set up, and
// what it last said about the lake it acted on. Shared between the ribbon
// toggle, the viewport overlay controls, and the water brush controller.
//
// The radius floor is the water map's resolution: a texel spans 8 m, and a
// smaller brush catches a texel centre only some of the time.
export class WaterBrushStore {
  enabled = false;
  brush: WaterBrushType = 'level';
  /** Brush radius in world units. */
  radius = 30;
  /** Brush strength, 0..1. */
  strength = 0.5;
  /** Metres the add brush digs its bed below the water, at the brush centre. */
  depth = 3;
  /** Palette entry the type brush paints, by name. */
  waterType = 'lake';
  /** What the brush last reported, e.g. the picked lake's level. */
  info = '';

  readonly dispatcher = new Dispatcher<WaterBrushStoreEvents>();

  setEnabled(value: boolean) {
    if (this.enabled === value) return;
    this.enabled = value;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setBrush(value: WaterBrushType) {
    if (this.brush === value) return;
    this.brush = value;
    this.info = '';
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setRadius(value: number) {
    const clamped = Math.min(
      WATER_BRUSH_RADIUS_MAX,
      Math.max(WATER_BRUSH_RADIUS_MIN, value)
    );
    if (this.radius === clamped) return;
    this.radius = clamped;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setStrength(value: number) {
    const clamped = Math.min(1, Math.max(0, value));
    if (this.strength === clamped) return;
    this.strength = clamped;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setDepth(value: number) {
    const clamped = Math.min(
      WATER_BRUSH_DEPTH_MAX,
      Math.max(WATER_BRUSH_DEPTH_MIN, value)
    );
    if (this.depth === clamped) return;
    this.depth = clamped;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setWaterType(value: string) {
    if (this.waterType === value) return;
    this.waterType = value;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setInfo(value: string) {
    if (this.info === value) return;
    this.info = value;
    this.dispatcher.dispatch({ kind: 'changed' });
  }
}

export const waterBrushStore = new WaterBrushStore();
