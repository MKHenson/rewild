import { Box3, Vector3 } from 'rewild-common';
import { Renderer } from '../Renderer';
import { Geometry } from '../geometry/Geometry';
import { PoseStore } from '../renderers/skinning/PoseStore';
import { isVisualComponent } from '../typeGuards';
import { Intersection, Raycaster } from './Raycaster';
import { SkinnedInstance } from './SkinnedInstance';
import { SkinnedMesh } from './SkinnedMesh';
import { Transform } from './Transform';

function fakeModel(primitiveCount: number) {
  const poses = new PoseStore({
    names: ['root'],
    parents: new Int32Array([-1]),
    translations: new Float32Array(3),
    rotations: new Float32Array([0, 0, 0, 1]),
    scales: new Float32Array([1, 1, 1]),
    inverseBindMatrices: new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]),
    rootMatrix: new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]),
  });
  const localBounds = new Box3();
  const primitives = Array.from({ length: primitiveCount }, () => ({
    geometry: new Geometry(),
    pass: { isGeometryCompatible: () => true, model: { localBounds } },
  }));
  return { poses, primitives, localBounds };
}

function fakeRenderer(model: ReturnType<typeof fakeModel>) {
  const released: string[] = [];
  const renderer = {
    skinnedModels: {
      acquire: () => model,
      release: (id: string) => released.push(id),
    },
  } as unknown as Renderer;
  return { renderer, released };
}

describe('SkinnedMesh raycast', () => {
  function setup() {
    const model = fakeModel(1);
    model.localBounds.min.set(-1, -1, -1);
    model.localBounds.max.set(1, 1, 1);
    const chicken = new SkinnedInstance(
      fakeRenderer(model).renderer,
      'chicken'
    );
    chicken.transform.position.set(10, 0, 0);
    chicken.transform.updateWorldMatrix(false, false);
    const raycaster = new Raycaster(
      new Vector3(10, 0, -5),
      new Vector3(0, 0, 1)
    );
    return { mesh: chicken.meshes[0], chicken, raycaster };
  }

  it('is not hit by default, so surface probes pass through it', () => {
    const { mesh, raycaster } = setup();
    const hits: Intersection[] = [];
    mesh.raycast(raycaster, hits);
    expect(hits).toHaveLength(0);
  });

  it('hits its bounds where it stands when asked', () => {
    const { mesh, chicken, raycaster } = setup();
    raycaster.hitsSkinned = true;
    const hits: Intersection[] = [];
    mesh.raycast(raycaster, hits);

    expect(hits).toHaveLength(1);
    expect(hits[0].object).toBe(chicken.transform);
    expect(hits[0].distance).toBeCloseTo(4);
    expect(hits[0].point.x).toBeCloseTo(10);
  });

  it('misses a ray that passes beside it', () => {
    const { mesh, raycaster } = setup();
    raycaster.hitsSkinned = true;
    raycaster.ray.origin.set(0, 0, -5);
    const hits: Intersection[] = [];
    mesh.raycast(raycaster, hits);
    expect(hits).toHaveLength(0);
  });
});

describe('SkinnedInstance', () => {
  it('puts a single primitive on its own transform as a visual component', () => {
    const model = fakeModel(1);
    const { renderer } = fakeRenderer(model);
    const chicken = new SkinnedInstance(renderer, 'chicken');

    const mesh = chicken.transform.component as SkinnedMesh;
    expect(mesh).toBe(chicken.meshes[0]);
    expect(isVisualComponent(mesh)).toBe(true);
    expect(mesh.instance).toBe(chicken);
    expect(mesh.localBounds).toBe(model.localBounds);
    expect(chicken.transform.children).toHaveLength(0);
  });

  it('hangs one child per primitive, all drawing the one pose', () => {
    const { renderer } = fakeRenderer(fakeModel(2));
    const deer = new SkinnedInstance(renderer, 'deer');

    expect(deer.transform.component).toBeNull();
    expect(deer.transform.children).toHaveLength(2);
    expect(deer.meshes.map((m) => m.transform.parent)).toEqual([
      deer.transform,
      deer.transform,
    ]);
    expect(deer.meshes.every((m) => m.instance === deer)).toBe(true);
  });

  it('follows its pose slot when another instance is removed', () => {
    const { renderer } = fakeRenderer(fakeModel(1));
    const first = new SkinnedInstance(renderer, 'chicken');
    const second = new SkinnedInstance(renderer, 'chicken');
    expect(second.slot).toBe(1);

    first.dispose();

    expect(second.slot).toBe(0);
  });

  it('shows and hides every mesh together', () => {
    const { renderer } = fakeRenderer(fakeModel(2));
    const deer = new SkinnedInstance(renderer, 'deer');

    deer.visible = false;

    expect(deer.visible).toBe(false);
    expect(deer.meshes.every((m) => !m.visible)).toBe(true);
  });

  it('frees its pose and meshes, and releases the model once', () => {
    const model = fakeModel(2);
    const { renderer, released } = fakeRenderer(model);
    const parent = new Transform();
    const deer = new SkinnedInstance(renderer, 'deer');
    parent.addChild(deer.transform);

    deer.dispose();
    deer.dispose();

    expect(model.poses.count).toBe(0);
    expect(released).toEqual(['deer']);
    expect(deer.transform.children).toHaveLength(0);
    expect(deer.meshes.every((m) => m.transform.component === null)).toBe(true);
  });
});
