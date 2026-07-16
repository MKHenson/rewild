import { Dispatcher } from 'rewild-common';
import type { SculptBrushType } from 'rewild-renderer';

export type SculptStoreEvents = { kind: 'changed' };

export const SCULPT_RADIUS_MIN = 2;
export const SCULPT_RADIUS_MAX = 100;

// Editor terrain-sculpting tool: whether sculpt mode is
// active and the current brush configuration. Shared between the ribbon
// toggle, the viewport overlay controls, and the sculpt controller.
export class SculptStore {
  enabled = false;
  brush: SculptBrushType = 'raise';
  /** Brush radius in world units. */
  radius = 20;
  /** Brush strength, 0..1. */
  strength = 0.5;

  readonly dispatcher = new Dispatcher<SculptStoreEvents>();

  setEnabled(value: boolean) {
    if (this.enabled === value) return;
    this.enabled = value;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setBrush(value: SculptBrushType) {
    if (this.brush === value) return;
    this.brush = value;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setRadius(value: number) {
    const clamped = Math.min(
      SCULPT_RADIUS_MAX,
      Math.max(SCULPT_RADIUS_MIN, value)
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
}

export const sculptStore = new SculptStore();
