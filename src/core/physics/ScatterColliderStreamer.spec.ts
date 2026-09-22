import * as R from '@dimforge/rapier3d-compat';
import type { Collider, ColliderDesc } from '@dimforge/rapier3d-compat';
import { SCATTER_INSTANCE_STRIDE, ScatterInstances } from 'rewild-renderer';
import {
  ColliderWorld,
  SCATTER_COLLIDER_ACTIVATE_DISTANCE as ACTIVATE,
  SCATTER_COLLIDER_DEACTIVATE_DISTANCE as DEACTIVATE,
  ScatterColliderStreamer,
} from './ScatterColliderStreamer';

// Records what the streamer asks for; a "collider" is the desc it was made from.
class FakeWorld implements ColliderWorld {
  live = new Set<ColliderDesc>();
  created = 0;
  removed = 0;

  createCollider(desc: ColliderDesc): Collider {
    this.live.add(desc);
    this.created++;
    return desc as unknown as Collider;
  }

  removeCollider(collider: Collider): void {
    this.live.delete(collider as unknown as ColliderDesc);
    this.removed++;
  }

  /** World x of every live collider, ascending. */
  xs(): number[] {
    return Array.from(this.live, (desc) => desc.translation.x).sort(
      (a, b) => a - b
    );
  }
}

/** A layer's instances stood in a row along x at y = 0, chunk-local. */
function row(layer: string, xs: number[]): ScatterInstances {
  const data = new Float32Array(xs.length * SCATTER_INSTANCE_STRIDE);
  xs.forEach((x, i) =>
    data.set([x, 0, 0, 0, 0, 0, 1, 1, 0], i * SCATTER_INSTANCE_STRIDE)
  );
  return { layer, slot: 0, count: xs.length, data };
}

const HALF = 240;

function streamer(budget?: number) {
  const world = new FakeWorld();
  return { world, streamer: new ScatterColliderStreamer(R, world, budget) };
}

describe('ScatterColliderStreamer', () => {
  it('activates inside the activate radius and nothing beyond it', () => {
    const { world, streamer: s } = streamer();
    s.setChunk('c', 0, 0, HALF, [
      row('oak_01', [ACTIVATE - 1, ACTIVATE + 1, DEACTIVATE + 1]),
    ]);

    s.update(0, 0, 0);

    expect(world.xs()).toEqual([ACTIVATE - 1]);
  });

  it('keeps a held collider out to the deactivate radius', () => {
    const { world, streamer: s } = streamer();
    s.setChunk('c', 0, 0, HALF, [row('oak_01', [10])]);

    s.update(0, 0, 0);
    expect(world.live.size).toBe(1);

    // Walk away in strides past the movement threshold: still held between
    // the two radii, released only once past the outer one.
    s.update(10 - ACTIVATE - 5, 0, 0);
    expect(world.live.size).toBe(1);
    expect(world.removed).toBe(0);

    s.update(10 - DEACTIVATE - 1, 0, 0);
    expect(world.live.size).toBe(0);
  });

  it('does not thrash an instance sitting on the activate radius', () => {
    const { world, streamer: s } = streamer();
    s.setChunk('c', 0, 0, HALF, [row('oak_01', [0])]);

    s.update(ACTIVATE - 1, 0, 0);
    expect(world.created).toBe(1);

    for (let step = 0; step < 4; step++) {
      s.update(ACTIVATE + 3, 0, 0);
      s.update(ACTIVATE - 3, 0, 0);
    }

    expect(world.created).toBe(1);
    expect(world.removed).toBe(0);
  });

  it('measures distance in three dimensions', () => {
    const { world, streamer: s } = streamer();
    s.setChunk('c', 0, 0, HALF, [row('oak_01', [0])]);

    s.update(0, ACTIVATE + 5, 0);
    expect(world.live.size).toBe(0);

    s.update(0, ACTIVATE - 5, 0);
    expect(world.live.size).toBe(1);
  });

  it('skips a layer with no collider proxy', () => {
    const { world, streamer: s } = streamer();
    s.setChunk('c', 0, 0, HALF, [row('granite_pebble_01', [1, 2, 3])]);

    s.update(0, 0, 0);

    expect(world.live.size).toBe(0);
    expect(s.stats().candidates).toBe(0);
  });

  it('poses colliders in world space from the chunk origin', () => {
    const { world, streamer: s } = streamer();
    s.setChunk('c', 1000, -500, HALF, [row('granite_boulder', [5])]);

    s.update(1000, 0, -500);

    const desc = Array.from(world.live)[0];
    expect(desc.translation).toEqual({ x: 1005, y: 0, z: -500 });
  });

  it('lets the nearest instances win when the budget is hit', () => {
    const { world, streamer: s } = streamer(2);
    s.setChunk('c', 0, 0, HALF, [row('oak_01', [30, 10, 20, -5])]);

    s.update(0, 0, 0);

    expect(world.xs()).toEqual([-5, 10]);
  });

  it('evicts a held collider for a clearly nearer newcomer', () => {
    const { world, streamer: s } = streamer(1);
    // Only the far instance is inside the band to begin with.
    s.setChunk('c', 0, 0, HALF, [row('oak_01', [0, 100])]);

    s.update(100 - ACTIVATE + 1, 0, 0);
    expect(world.xs()).toEqual([100]);

    // Now the near one is far closer than the held one; it takes the slot.
    s.update(ACTIVATE - 1, 0, 0);
    expect(world.xs()).toEqual([0]);
  });

  it('gives a held collider the band width of grace before a newcomer takes its slot', () => {
    const { world, streamer: s } = streamer(1);
    const band = DEACTIVATE - ACTIVATE;
    s.setChunk('c', 0, 0, HALF, [row('oak_01', [0, 20])]);

    // Stand nearest the far one so it takes the single slot.
    s.update(20, 0, 0);
    expect(world.xs()).toEqual([20]);

    // Move to where the near one is closer, but by less than the band: the
    // held collider keeps its slot.
    s.update(10 - band / 4, 0, 0);
    expect(world.xs()).toEqual([20]);

    // Closer by more than the band, and it loses it.
    s.update(10 - band, 0, 0);
    expect(world.xs()).toEqual([0]);
  });

  it('ranks across chunks and layers', () => {
    const { world, streamer: s } = streamer(3);
    s.setChunk('a', 0, 0, HALF, [
      row('oak_01', [1, 30]),
      row('granite_boulder', [2]),
    ]);
    s.setChunk('b', 0, 0, HALF, [row('poplar_01', [3, 25])]);

    s.update(0, 0, 0);

    expect(world.xs()).toEqual([1, 2, 3]);
    expect(s.activeCount).toBe(3);
  });

  it('releases everything a chunk held when it is replaced or removed', () => {
    const { world, streamer: s } = streamer();
    s.setChunk('c', 0, 0, HALF, [row('oak_01', [1, 2])]);
    s.update(0, 0, 0);
    expect(world.live.size).toBe(2);

    // A rebuild replaces the set outright, and re-evaluates without movement.
    s.setChunk('c', 0, 0, HALF, [row('oak_01', [3])]);
    s.update(0, 0, 0);
    expect(world.xs()).toEqual([3]);

    s.removeChunk('c');
    s.update(0, 0, 0);
    expect(world.live.size).toBe(0);
    expect(s.stats().chunks).toBe(0);
  });

  it('releases a chunk wholesale once its nearest edge is past the band', () => {
    const { world, streamer: s } = streamer();
    s.setChunk('c', 0, 0, HALF, [row('oak_01', [HALF - 1, HALF - 2])]);

    s.update(HALF, 0, 0);
    expect(world.live.size).toBe(2);

    s.update(HALF + DEACTIVATE + 1, 0, 0);
    expect(world.live.size).toBe(0);
  });

  it('does nothing until the viewer has moved', () => {
    const { world, streamer: s } = streamer();
    s.setChunk('c', 0, 0, HALF, [row('oak_01', [ACTIVATE + 1])]);

    s.update(0, 0, 0);
    expect(world.live.size).toBe(0);

    // A step under the threshold that would otherwise cross the radius.
    s.update(1.5, 0, 0);
    expect(world.live.size).toBe(0);
    s.update(3, 0, 0);
    expect(world.live.size).toBe(1);
  });

  it('survives an eligible set larger than its initial columns', () => {
    const { world, streamer: s } = streamer(4096);
    const xs = Array.from({ length: 2000 }, (_, i) => (i % 40) - 20);
    s.setChunk('c', 0, 0, HALF, [row('oak_01', xs)]);

    s.update(0, 0, 0);

    expect(world.live.size).toBe(2000);
  });

  it('reports per-layer counts', () => {
    const { streamer: s } = streamer(1);
    s.setChunk('c', 0, 0, HALF, [
      row('oak_01', [1, 2]),
      row('granite_boulder', [3]),
    ]);
    s.update(0, 0, 0);

    expect(s.stats()).toMatchObject({
      chunks: 1,
      candidates: 3,
      active: 1,
      budget: 1,
      layers: [
        { layer: 'oak_01', candidates: 2, active: 1 },
        { layer: 'granite_boulder', candidates: 1, active: 0 },
      ],
    });
  });

  it('releases everything on dispose', () => {
    const { world, streamer: s } = streamer();
    s.setChunk('c', 0, 0, HALF, [row('oak_01', [1, 2, 3])]);
    s.update(0, 0, 0);

    s.dispose();

    expect(world.live.size).toBe(0);
    expect(s.activeCount).toBe(0);
  });
});
