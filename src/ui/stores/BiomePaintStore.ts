import { Dispatcher } from 'rewild-common';
import type { PaintBrushType } from 'rewild-renderer';

export type BiomePaintStoreEvents = { kind: 'changed' };

export const BIOME_PAINT_RADIUS_MIN = 5;
export const BIOME_PAINT_RADIUS_MAX = 300;

// Editor biome-painting tool: whether paint mode is active and the current
// brush configuration. Shared between the ribbon toggle, the viewport overlay
// controls, and the paint controller.
//
// The radius range is much wider than the sculpt brush's (2..100). A sculpt
// stroke shapes a hill; a paint stroke redraws which *country* the ground
// belongs to, and climate borders are kilometres across — a biome painted at
// sculpt-brush scale reads as a blotch rather than a region.
//
// `biome` is an index into the active climate's `biomes` array, not a global
// biome id: the palette a chunk's splat map can address is exactly the
// materials of the climate's own biomes, so painting is scoped to that set.
// A preset change invalidates every chunk (and every mask), which is why the
// index needs no migration.
export class BiomePaintStore {
  enabled = false;
  brush: PaintBrushType = 'paint';
  /** Index into the active ClimateConfig's `biomes`. */
  biome = 0;
  /** Brush radius in world units. */
  radius = 80;
  /** Brush strength, 0..1. */
  strength = 0.5;

  readonly dispatcher = new Dispatcher<BiomePaintStoreEvents>();

  setEnabled(value: boolean) {
    if (this.enabled === value) return;
    this.enabled = value;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setBrush(value: PaintBrushType) {
    if (this.brush === value) return;
    this.brush = value;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setBiome(value: number) {
    if (this.biome === value) return;
    this.biome = value;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  setRadius(value: number) {
    const clamped = Math.min(
      BIOME_PAINT_RADIUS_MAX,
      Math.max(BIOME_PAINT_RADIUS_MIN, value)
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

export const biomePaintStore = new BiomePaintStore();
