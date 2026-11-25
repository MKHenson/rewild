import { Vector3 } from 'rewild-common';
import { UISurface } from 'rewild-gpu-ui';
import { Raycaster } from './Raycaster';
import { Transform } from './Transform';
import { UISurface3D, UISurface3DList } from './UISurface3D';

function host() {
  const surfaces: UISurface[] = [];
  return {
    surfaces,
    addSurface: (surface: UISurface) => surfaces.push(surface),
    removeSurface: (surface: UISurface) =>
      surfaces.splice(surfaces.indexOf(surface), 1),
  };
}

function ray(origin: Vector3, direction: Vector3) {
  const raycaster = new Raycaster();
  raycaster.ray.origin.copy(origin);
  raycaster.ray.direction.copy(direction);
  return raycaster;
}

describe('UISurface3D', () => {
  it('owns a world surface and its transform', () => {
    const panel = new UISurface3D({
      name: 'panel',
      size: { width: 2, height: 1 },
    });
    expect(panel.surface.kind).toBe('world');
    expect(panel.surface.size).toEqual({ width: 2, height: 1 });
    expect(panel.transform.component).toBe(panel);
  });

  it('is hit through its quad, from the front or the back', () => {
    const panel = new UISurface3D({
      name: 'panel',
      size: { width: 2, height: 1 },
    });
    panel.transform.position.set(0, 1, 0);
    panel.transform.updateMatrixWorld();

    const front = ray(new Vector3(0.5, 1, 4), new Vector3(0, 0, -1));
    const hits = front.intersectObject(panel.transform);
    expect(hits).toHaveLength(1);
    expect(hits[0].distance).toBeCloseTo(4);
    expect(hits[0].object).toBe(panel.transform);
    expect(hits[0].point.x).toBeCloseTo(0.5);
    expect(hits[0].point.z).toBeCloseTo(0);

    const back = ray(new Vector3(0, 1, -3), new Vector3(0, 0, 1));
    expect(back.intersectObject(panel.transform)[0].distance).toBeCloseTo(3);

    const wide = ray(new Vector3(1.5, 1, 4), new Vector3(0, 0, -1));
    expect(wide.intersectObject(panel.transform)).toEqual([]);
  });
});

describe('UISurface3DList', () => {
  it('shows the surfaces in the scene, at their transforms', () => {
    const list = new UISurface3DList();
    const ui = host();
    const panel = new UISurface3D({ name: 'panel' });
    panel.transform.position.set(3, 2, 1);
    panel.transform.updateMatrixWorld();

    list.update([panel], ui);
    expect(ui.surfaces).toEqual([panel.surface]);
    expect(panel.surface.worldMatrix.equals(panel.transform.matrixWorld)).toBe(
      true
    );

    list.update([panel], ui);
    expect(ui.surfaces).toEqual([panel.surface]);
  });

  it('hides a surface that leaves the scene, and shows it when it is back', () => {
    const list = new UISurface3DList();
    const ui = host();
    const a = new UISurface3D({ name: 'a' });
    const b = new UISurface3D({ name: 'b' });

    list.update([a, b], ui);
    list.update([b], ui);
    expect(ui.surfaces).toEqual([b.surface]);
    list.update([a, b], ui);
    expect(ui.surfaces).toEqual([b.surface, a.surface]);
    list.update([], ui);
    expect(ui.surfaces).toEqual([]);
  });

  it('follows its transform when the parent moves', () => {
    const list = new UISurface3DList();
    const ui = host();
    const parent = new Transform();
    const panel = new UISurface3D({ name: 'panel' });
    parent.addChild(panel.transform);
    parent.position.set(5, 0, 0);
    parent.updateMatrixWorld();

    list.update([panel], ui);
    expect(panel.surface.worldMatrix.elements[12]).toBe(5);
  });
});
