import { SCATTER_GPU_STRIDE } from '../../materials/ScatterInstancedPass';
import { SCATTER_INSTANCE_STRIDE, ScatterInstances } from './Scatter';
import {
  ScatterChunkLayer,
  composeNodeMatrix,
  packInstances,
} from './ScatterChunkLayer';
import { Geometry } from '../../geometry/Geometry';
import { Transform } from '../../core/Transform';

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
      60
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
      60
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
      60
    );

    expect(layer.localBounds.isEmpty()).toBe(true);
  });
});
