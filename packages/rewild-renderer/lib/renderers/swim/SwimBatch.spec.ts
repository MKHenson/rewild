import { Euler, EulerRotationOrder, Quaternion } from 'rewild-common';
import { Renderer } from '../../Renderer';
import { Geometry } from '../../geometry/Geometry';
import { isVisualComponent } from '../../typeGuards';
import {
  SWIM_STRIDE,
  SwimBatch,
  writeBodyUniforms,
  writeQuaternionYXZ,
} from './SwimBatch';
import { SwimModel, measureBody } from './SwimModel';

const IDENTITY = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

function geometryOf(points: number[]): { vertices: Float32Array } {
  return { vertices: new Float32Array(points) };
}

function fakeRenderer(primitiveCount = 2) {
  const model = {
    primitives: Array.from({ length: primitiveCount }, () => ({
      geometry: new Geometry(),
      pass: {},
      nodeMatrix: IDENTITY,
    })),
    body: { nose: 0.1, length: 0.2, pivot: 0.5, radius: 0.12 },
  } as unknown as SwimModel;
  const moved: unknown[] = [];
  const acquire = jest.fn(() => model);
  const release = jest.fn();
  const renderer = {
    swimModels: { acquire, release },
    sceneBVH: { markObjectMoved: (t: unknown) => moved.push(t) },
  } as unknown as Renderer;
  return { renderer, model, moved, acquire, release };
}

const SHAPE = { stiff: 0.3, wavelength: 1, head: 0.1 };

describe('measureBody', () => {
  it('finds the nose, length and pivot along Z', () => {
    const body = measureBody([
      {
        geometry: geometryOf([0, 0, 0.15, 0, 0.02, -0.05]),
        nodeMatrix: IDENTITY,
      },
    ]);
    expect(body.nose).toBeCloseTo(0.15);
    expect(body.length).toBeCloseTo(0.2);
    expect(body.pivot).toBeCloseTo(0.75);
    expect(body.radius).toBeCloseTo(0.15);
  });

  it('measures after the node matrix', () => {
    const scaled = new Float32Array(IDENTITY);
    scaled[0] = scaled[5] = scaled[10] = 0.5;
    scaled[14] = 1;
    const body = measureBody([
      { geometry: geometryOf([0, 0, 1, 0, 0, -1]), nodeMatrix: scaled },
    ]);
    expect(body.nose).toBeCloseTo(1.5);
    expect(body.length).toBeCloseTo(1);
    expect(body.pivot).toBe(1);
  });

  it('spans every primitive', () => {
    const body = measureBody([
      { geometry: geometryOf([0, 0, 0.3]), nodeMatrix: IDENTITY },
      { geometry: geometryOf([0, 0, -0.1]), nodeMatrix: IDENTITY },
    ]);
    expect(body.length).toBeCloseTo(0.4);
    expect(body.pivot).toBeCloseTo(0.75);
  });
});

describe('writeQuaternionYXZ', () => {
  it('matches a YXZ Euler', () => {
    const out = new Float32Array(5);
    const angles: [number, number, number][] = [
      [0.3, 1.2, -0.4],
      [-0.7, -2.5, 0.2],
      [0, Math.PI, 0],
    ];
    for (const [x, y, z] of angles) {
      writeQuaternionYXZ(out, 1, x, y, z);
      const q = new Quaternion().setFromEuler(
        new Euler(x, y, z, EulerRotationOrder.YXZ)
      );
      expect(out[1]).toBeCloseTo(q.x);
      expect(out[2]).toBeCloseTo(q.y);
      expect(out[3]).toBeCloseTo(q.z);
      expect(out[4]).toBeCloseTo(q.w);
    }
  });
});

describe('writeBodyUniforms', () => {
  it('packs the body then the shape', () => {
    const out = new Float32Array(10);
    writeBodyUniforms(
      { nose: 0.1, length: 0.2, pivot: 0.5, radius: 1 },
      { ...SHAPE, wavelength: 1.1, fin: { amplitude: 0.3, rate: 2 } },
      out,
      2
    );
    expect(Array.from(out.subarray(2))).toEqual(
      Array.from(new Float32Array([0.1, 0.2, 0.5, 1.1, 0.3, 0.1, 0.3, 2]))
    );
  });

  it('leaves the head and fins at 0 when left out', () => {
    const out = new Float32Array(8).fill(9);
    writeBodyUniforms(
      { nose: 0, length: 1, pivot: 0, radius: 1 },
      { stiff: 0, wavelength: 1 },
      out,
      0
    );
    expect(out[5]).toBe(0);
    expect(out[6]).toBe(0);
    expect(out[7]).toBe(0);
  });
});

describe('SwimBatch', () => {
  it('makes one scene mesh per primitive, casting no shadow', () => {
    const { renderer } = fakeRenderer(2);
    const batch = new SwimBatch(renderer, 'sardine', SHAPE, 4);
    expect(batch.meshes).toHaveLength(2);
    expect(batch.transform.children).toHaveLength(2);
    for (const mesh of batch.meshes) {
      expect(isVisualComponent(mesh)).toBe(true);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.localBounds).toBe(batch.localBounds);
      expect(mesh.transform.component).toBe(mesh);
    }
  });

  it('writes a member place and wave into its slot', () => {
    const { renderer } = fakeRenderer();
    const batch = new SwimBatch(renderer, 'sardine', SHAPE, 3);
    batch.setPlace(2, 1, 2, 3, 0.5, 0, Math.PI / 2, 0);
    batch.setWave(2, 0.4, 0.5, -0.2);
    const o = 2 * SWIM_STRIDE;
    const d = batch.data;
    expect(Array.from(d.subarray(o, o + 4))).toEqual([1, 2, 3, 0.5]);
    expect(d[o + 5]).toBeCloseTo(Math.SQRT1_2);
    expect(d[o + 7]).toBeCloseTo(Math.SQRT1_2);
    expect(d[o + 8]).toBeCloseTo(0.4);
    expect(d[o + 9]).toBeCloseTo(0.5);
    expect(d[o + 10]).toBeCloseTo(-0.2);
  });

  it('bounds the drawn members by the body radius and marks them moved', () => {
    const { renderer, moved } = fakeRenderer(2);
    const batch = new SwimBatch(renderer, 'sardine', SHAPE, 3);
    batch.setPlace(0, -1, 0, 0, 1, 0, 0, 0);
    batch.setPlace(1, 2, 1, -3, 2, 0, 0, 0);
    batch.setPlace(2, 50, 50, 50, 1, 0, 0, 0);
    batch.count = 2;
    batch.commit();
    const { min, max } = batch.localBounds;
    expect(min.x).toBeCloseTo(-1.12);
    expect(min.y).toBeCloseTo(-0.12);
    expect(min.z).toBeCloseTo(-3.24);
    expect(max.x).toBeCloseTo(2.24);
    expect(max.y).toBeCloseTo(1.24);
    expect(max.z).toBeCloseTo(0.12);
    expect(moved).toEqual(batch.meshes.map((m) => m.transform));
  });

  it('uploads the drawn members once per commit', () => {
    const { renderer } = fakeRenderer(1);
    const writeBuffer = jest.fn();
    const createBuffer = jest.fn(() => ({ destroy: jest.fn() }));
    (globalThis as any).GPUBufferUsage = { STORAGE: 1, COPY_DST: 2 };
    const gpu = {
      device: { createBuffer, queue: { writeBuffer } },
    } as unknown as Renderer;
    const batch = new SwimBatch(renderer, 'sardine', SHAPE, 8);
    batch.count = 3;
    batch.commit();
    const buffer = batch.instanceBuffer(gpu);
    expect(batch.instanceBuffer(gpu)).toBe(buffer);
    expect(createBuffer).toHaveBeenCalledTimes(1);
    expect(writeBuffer).toHaveBeenCalledTimes(1);
    expect(writeBuffer.mock.calls[0][4]).toBe(3 * SWIM_STRIDE);
    batch.commit();
    batch.instanceBuffer(gpu);
    expect(writeBuffer).toHaveBeenCalledTimes(2);
  });

  it('releases its model on dispose', () => {
    const { renderer, acquire, release } = fakeRenderer();
    const batch = new SwimBatch(renderer, 'sardine', SHAPE, 1);
    expect(acquire).toHaveBeenCalledWith(renderer, 'sardine');
    batch.dispose();
    expect(release).toHaveBeenCalledWith('sardine');
    expect(batch.meshes).toHaveLength(0);
  });
});
