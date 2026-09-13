import { Dispatcher } from 'rewild-common';

export type ScatterPaintStoreEvents = { kind: 'changed' };

// Paint raises a layer's density, erase lifts the paint back off (revealing
// whatever the biome grows), exclude suppresses every layer. Exclude is its own
// brush rather than "paint at zero" because zero already means "say nothing":
// clearing a building site of biome-grown trees takes a weight of its own (see
// scatterExcludeChannel).
export type ScatterBrushType = 'paint' | 'erase' | 'exclude';

export const SCATTER_PAINT_RADIUS_MIN = 10;
export const SCATTER_PAINT_RADIUS_MAX = 250;

// Editor scatter-density painting: whether the tool is armed and how the brush
// is set up. Shared between the ribbon toggle, the viewport overlay controls,
// and the paint controller.
//
// A grove is a smaller thing than a climate region, so the range sits between
// the sculpt brush's (2..100) and the biome brush's (5..300). The floor is the
// mask's own resolution: a density texel spans SCATTER_MASK_STEP samples (16m),
// and a brush below that catches a texel centre only some of the time.
//
// `layer` is an index into getScatterLayerOrder(), which is the whole library
// rather than the current climate's subset: every layer is paintable anywhere,
// and painting one the local biome never emits is the ordinary case with a
// biome density of zero. That index is also the mask channel, so appending to
// the library is safe and reordering it is not.
export class ScatterPaintStore {
  enabled = false;
  brush: ScatterBrushType = 'paint';
  /** Index into getScatterLayerOrder() — a mask channel. */
  layer = 0;
  /** Brush radius in world units. */
  radius = 50;
  /** Brush strength, 0..1. */
  strength = 0.5;

  readonly dispatcher = new Dispatcher<ScatterPaintStoreEvents>();

  setEnabled(value: boolean) {
    if (this.enabled === value) return;
    this.enabled = value;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setBrush(value: ScatterBrushType) {
    if (this.brush === value) return;
    this.brush = value;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setLayer(value: number) {
    if (this.layer === value) return;
    this.layer = value;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setRadius(value: number) {
    const clamped = Math.min(
      SCATTER_PAINT_RADIUS_MAX,
      Math.max(SCATTER_PAINT_RADIUS_MIN, value)
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

export const scatterPaintStore = new ScatterPaintStore();
