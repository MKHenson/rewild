import { SCATTER_GPU_STRIDE } from '../../materials/ScatterInstancedPass';
import { SCATTER_INSTANCE_STRIDE, ScatterInstances } from './Scatter';
import {
  SCATTER_CELL_GRID,
  ScatterChunkLayer,
  bucketInstances,
  composeNodeMatrix,
  packInstances,
} from './ScatterChunkLayer';
import { Vector3 } from 'rewild-common';
import { Geometry } from '../../geometry/Geometry';
import { Transform } from '../../core/Transform';
import { ScatterLayer } from './ScatterLayers';

const testLayer = { cullDistance: 60 } as ScatterLayer;

function identityMatrix(): Float32Array<ArrayBuffer> {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function instancesOf(values: number[][]): ScatterInstances {
  const data = new Float32Array(values.length * SCATTER_INSTANCE_STRIDE);
  values.forEach((instance, i) =>
    data.set(instance, i * SCATTER_INSTANCE_STRIDE)
  );
  return { layer: 'test', slot: 0, count: values.length, data };
}

describe('packInstances', () => {
  // The GPU layout is two vec4s plus a params slot, which reorders scale up
  // beside the position and leaves the quaternion whole.
  it('reorders the CPU stride into the shader layout', () => {
    // f32-exact values, so the comparison is about the reordering rather than
    // about float rounding.
    const packed = packInstances(
      instancesOf([[1, 2, 3, 0.125, 0.25, 0.375, 0.5, 5, 0.75]])
    );

    expect(Array.from(packed.subarray(0, 9))).toEqual([
      1, 2, 3, 5, 0.125, 0.25, 0.375, 0.5, 0.75,
    ]);
  });

  it('packs every instance at the GPU stride', () => {
    const packed = packInstances(
      instancesOf([
        [1, 1, 1, 0, 0, 0, 1, 2, 0],
        [4, 5, 6, 0, 0, 0, 1, 3, 0.5],
      ])
    );

    expect(packed.length).toBe(2 * SCATTER_GPU_STRIDE);
    expect(packed[SCATTER_GPU_STRIDE]).toBe(4);
    expect(packed[SCATTER_GPU_STRIDE + 3]).toBe(3);
    expect(packed[SCATTER_GPU_STRIDE + 8]).toBe(0.5);
  });

  it('handles an empty list', () => {
    expect(packInstances(instancesOf([])).length).toBe(0);
  });
});

describe('composeNodeMatrix', () => {
  const identity = [0, 0, 0] as [number, number, number];
  const noRotation = [0, 0, 0, 1] as [number, number, number, number];
  const unit = [1, 1, 1] as [number, number, number];

  it('composes a translation into the matrix', () => {
    const matrix = composeNodeMatrix([2, 3, 4], noRotation, unit, null, 'test');
    expect(Array.from(matrix.subarray(12, 15))).toEqual([2, 3, 4]);
  });

  it('applies the parent transform to the child', () => {
    const parent = composeNodeMatrix(
      [10, 0, 0],
      noRotation,
      unit,
      null,
      'test'
    );
    const child = composeNodeMatrix(
      [0, 5, 0],
      noRotation,
      unit,
      parent,
      'test'
    );
    expect(Array.from(child.subarray(12, 15))).toEqual([10, 5, 0]);
  });

  it('accepts a uniform scale', () => {
    const matrix = composeNodeMatrix(
      identity,
      noRotation,
      [2, 2, 2],
      null,
      't'
    );
    expect(matrix[0]).toBeCloseTo(2);
  });

  // The shader recovers an instance normal by rotating it, which only holds
  // while every scale in the chain is uniform.
  it('rejects a non-uniform scale rather than shading it wrong', () => {
    expect(() =>
      composeNodeMatrix(identity, noRotation, [1, 2, 1], null, 'pine')
    ).toThrow(/scaled non-uniformly/);
  });
});

describe('instance bounds', () => {
  // Culling a chunk of scatter by the model's own bounds tests a single point
  // at the chunk origin, which is what made whole chunks blink with the camera.
  it('covers every instance, not just the model at the origin', () => {
    const geometry = new Geometry();
    geometry.vertices = new Float32Array([-1, -1, -1, 1, 1, 1]);

    const layer = new ScatterChunkLayer(
      new Transform(),
      geometry,
      {} as never,
      identityMatrix(),
      instancesOf([
        [-100, 5, -100, 0, 0, 0, 1, 1, 0],
        [100, 20, 100, 0, 0, 0, 1, 2, 0],
      ]),
      testLayer,
      0,
      0
    );

    expect(layer.localBounds.min.x).toBeLessThanOrEqual(-101);
    expect(layer.localBounds.max.x).toBeGreaterThanOrEqual(102);
    expect(layer.localBounds.min.z).toBeLessThanOrEqual(-101);
    expect(layer.localBounds.max.z).toBeGreaterThanOrEqual(102);
    expect(layer.localBounds.max.y).toBeGreaterThanOrEqual(22);
  });

  it('scales the model reach by the instance scale', () => {
    const geometry = new Geometry();
    geometry.vertices = new Float32Array([-2, -2, -2, 2, 2, 2]);

    const layer = new ScatterChunkLayer(
      new Transform(),
      geometry,
      {} as never,
      identityMatrix(),
      instancesOf([[0, 0, 0, 0, 0, 0, 1, 3, 0]]),
      testLayer,
      0,
      0
    );

    // Corner radius of a 2-unit half-extent box is sqrt(12) ≈ 3.46, tripled.
    expect(layer.localBounds.max.x).toBeCloseTo(Math.sqrt(12) * 3, 3);
  });

  it('is empty for a layer with no instances', () => {
    const geometry = new Geometry();
    geometry.vertices = new Float32Array([-1, -1, -1, 1, 1, 1]);

    const layer = new ScatterChunkLayer(
      new Transform(),
      geometry,
      {} as never,
      identityMatrix(),
      instancesOf([]),
      testLayer,
      0,
      0
    );

    expect(layer.localBounds.isEmpty()).toBe(true);
  });
});

describe('instanceStorageBuffer', () => {
  function fakeRenderer() {
    const buffers: { label?: string }[] = [];
    const uploads: unknown[][] = [];

    const renderer = {
      device: {
        createBuffer(desc: { label?: string }) {
          buffers.push(desc);
          return { ...desc, destroy() {} };
        },
        createBindGroup(desc: unknown) {
          return desc;
        },
        queue: {
          writeBuffer(...args: unknown[]) {
            uploads.push(args);
          },
        },
      },
    };

    return { renderer: renderer as never, buffers, uploads };
  }

  function layerOf(instances: number[][]): ScatterChunkLayer {
    const geometry = new Geometry();
    geometry.vertices = new Float32Array([-1, -1, -1, 1, 1, 1]);
    return new ScatterChunkLayer(
      new Transform(),
      geometry,
      { instanceBindGroupLayout: () => null } as never,
      identityMatrix(),
      instancesOf(instances),
      testLayer,
      0,
      0
    );
  }

  beforeAll(() => {
    (globalThis as Record<string, unknown>).GPUBufferUsage = {
      STORAGE: 0x80,
      UNIFORM: 0x40,
      COPY_DST: 0x08,
    };
  });

  // The shadow pass runs before the scene pass, so both ask for this buffer and
  // whichever is first uploads it — a second copy per chunk would double the
  // instance memory of the whole world.
  it('uploads once however many callers ask', () => {
    const { renderer, uploads } = fakeRenderer();
    const layer = layerOf([[1, 2, 3, 0, 0, 0, 1, 1, 0]]);

    const first = layer.instanceStorageBuffer(renderer);
    const second = layer.instanceStorageBuffer(renderer);

    expect(first).toBe(second);
    expect(uploads.length).toBe(1);
  });

  it('shares the uploaded buffer with the scene bind group', () => {
    const { renderer } = fakeRenderer();
    const layer = layerOf([[1, 2, 3, 0, 0, 0, 1, 1, 0]]);

    const instances = layer.instanceStorageBuffer(renderer);
    const bindGroup = layer.prepareInstances(renderer, {
      instanceBindGroupLayout: () => null,
    } as never) as unknown as { entries: { resource: { buffer: unknown } }[] };

    expect(bindGroup.entries[1].resource.buffer).toBe(instances);
  });

  // Nothing to bind means nothing to draw: the shadow renderer leaves an empty
  // group out of its uniform map entirely rather than drawing zero instances.
  it('is null for a layer with no instances', () => {
    const { renderer } = fakeRenderer();
    expect(layerOf([]).instanceStorageBuffer(renderer)).toBeNull();
  });
});

describe('bucketInstances', () => {
  // A cell's instances have to be one contiguous run of the packed buffer, or
  // a draw could not address a cell with a first-instance offset.
  it('groups each cell into one contiguous run, row-major in z then x', () => {
    const cells = bucketInstances(
      instancesOf([
        [470, 0, 470, 0, 0, 0, 1, 1, 0],
        [0, 0, 0, 0, 0, 0, 1, 1, 0],
        [470, 0, 0, 0, 0, 0, 1, 1, 0],
        [5, 0, 5, 0, 0, 0, 1, 1, 0],
      ]),
      1
    );

    const last = SCATTER_CELL_GRID * SCATTER_CELL_GRID - 1;
    expect(Array.from(cells.order)).toEqual([1, 3, 2, 0]);
    expect(cells.starts[0]).toBe(0);
    expect(cells.starts[1]).toBe(2);
    expect(cells.starts[SCATTER_CELL_GRID - 1]).toBe(2);
    expect(cells.starts[SCATTER_CELL_GRID]).toBe(3);
    expect(cells.starts[last]).toBe(3);
    expect(cells.starts[last + 1]).toBe(4);
  });

  it('bounds each cell by its instances out to the model reach at their scale', () => {
    const cells = bucketInstances(
      instancesOf([
        [10, 4, 10, 0, 0, 0, 1, 2, 0],
        [400, 0, 400, 0, 0, 0, 1, 1, 0],
      ]),
      1.5
    );

    expect(Array.from(cells.bounds.subarray(0, 6))).toEqual([
      7, 1, 7, 13, 7, 13,
    ]);
  });

  it('packs in cell order', () => {
    const instances = instancesOf([
      [470, 0, 470, 0, 0, 0, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 1, 1, 0],
    ]);
    const packed = packInstances(
      instances,
      bucketInstances(instances, 1).order
    );
    expect(packed[0]).toBe(0);
    expect(packed[SCATTER_GPU_STRIDE]).toBe(470);
  });
});

describe('selectInstances', () => {
  function layerWith(band: [number, number], instances: number[][]) {
    const geometry = new Geometry();
    geometry.vertices = new Float32Array([-1, -1, -1, 1, 1, 1]);
    const layer = new ScatterChunkLayer(
      new Transform(),
      geometry,
      {} as never,
      identityMatrix(),
      instancesOf(instances),
      { cullDistance: band[1], lodDistances: [band[0]] } as ScatterLayer,
      1,
      0
    );
    return layer;
  }

  const spread = [
    [0, 0, 0, 0, 0, 0, 1, 1, 0],
    [240, 0, 0, 0, 0, 0, 1, 1, 0],
    [470, 0, 0, 0, 0, 0, 1, 1, 0],
    [0, 0, 470, 0, 0, 0, 1, 1, 0],
    [470, 0, 470, 0, 0, 0, 1, 1, 0],
  ];

  it('keeps only the cells the band can reach', () => {
    const layer = layerWith([0, 60], spread);
    layer.applyLodBias(0);
    layer.selectInstances(new Vector3(0, 0, 0));

    expect(layer.rangeCount).toBe(1);
    expect(layer.rangeStarts[0]).toBe(0);
    expect(layer.rangeCounts[0]).toBe(1);
  });

  it('drops the cells nearer than the band', () => {
    const layer = layerWith([100, 300], spread);
    layer.selectInstances(new Vector3(0, 0, 0));

    const drawn = new Set<number>();
    for (let r = 0; r < layer.rangeCount; r++)
      for (let i = 0; i < layer.rangeCounts[r]; i++)
        drawn.add(layer.rangeStarts[r] + i);

    // The instance at the viewer is inside the band's near edge; the one at
    // 240m is in; the corners at 470m and 665m are beyond its far edge.
    expect(drawn).toEqual(new Set([1]));
  });

  it('merges neighbouring cells in a row into one run', () => {
    const layer = layerWith([0, 1000], spread);
    layer.selectInstances(new Vector3(0, 0, 0));

    // Everything drawn, and the row-major order makes it a single run.
    expect(layer.rangeCount).toBe(1);
    expect(layer.rangeCounts[0]).toBe(5);
  });

  it('draws nothing when the bias has shifted the chain off the tier', () => {
    const layer = layerWith([0, 60], spread);
    layer.applyLodBias(-3);
    layer.selectInstances(new Vector3(0, 0, 0));
    expect(layer.rangeCount).toBe(0);
  });
});
