import { Frustum } from './Frustum';
import { Sphere } from './Sphere';
import { Plane } from './Plane';
import { Vector3 } from './Vector3';
import { Matrix4 } from './Matrix4';
import { Box3 } from './Box3';

const unit3 = new Vector3(1, 0, 0);
const zero3 = new Vector3(0, 0, 0);
const one3 = new Vector3(1, 1, 1);
const eps = 0.0001;

describe('Frustum', () => {
  // INSTANCING
  test('Instancing', () => {
    let a = new Frustum();

    expect(a.planes).toBeDefined();
    expect(a.planes.length).toBe(6);

    const pDefault = new Plane();
    for (let i = 0; i < 6; i++) {
      expect(a.planes[i].equals(pDefault)).toBe(true);
    }

    const p0 = new Plane(unit3, -1);
    const p1 = new Plane(unit3, 1);
    const p2 = new Plane(unit3, 2);
    const p3 = new Plane(unit3, 3);
    const p4 = new Plane(unit3, 4);
    const p5 = new Plane(unit3, 5);

    a = new Frustum(p0, p1, p2, p3, p4, p5);
    expect(a.planes[0].equals(p0)).toBe(true);
    expect(a.planes[1].equals(p1)).toBe(true);
    expect(a.planes[2].equals(p2)).toBe(true);
    expect(a.planes[3].equals(p3)).toBe(true);
    expect(a.planes[4].equals(p4)).toBe(true);
    expect(a.planes[5].equals(p5)).toBe(true);
  });

  // PUBLIC
  test('set', () => {
    const a = new Frustum();
    const p0 = new Plane(unit3, -1);
    const p1 = new Plane(unit3, 1);
    const p2 = new Plane(unit3, 2);
    const p3 = new Plane(unit3, 3);
    const p4 = new Plane(unit3, 4);
    const p5 = new Plane(unit3, 5);

    a.set(p0, p1, p2, p3, p4, p5);

    expect(a.planes[0].equals(p0)).toBe(true);
    expect(a.planes[1].equals(p1)).toBe(true);
    expect(a.planes[2].equals(p2)).toBe(true);
    expect(a.planes[3].equals(p3)).toBe(true);
    expect(a.planes[4].equals(p4)).toBe(true);
    expect(a.planes[5].equals(p5)).toBe(true);
  });

  test('clone', () => {
    const p0 = new Plane(unit3, -1);
    const p1 = new Plane(unit3, 1);
    const p2 = new Plane(unit3, 2);
    const p3 = new Plane(unit3, 3);
    const p4 = new Plane(unit3, 4);
    const p5 = new Plane(unit3, 5);

    const b = new Frustum(p0, p1, p2, p3, p4, p5);
    const a = b.clone();
    expect(a.planes[0].equals(p0)).toBe(true);
    expect(a.planes[1].equals(p1)).toBe(true);
    expect(a.planes[2].equals(p2)).toBe(true);
    expect(a.planes[3].equals(p3)).toBe(true);
    expect(a.planes[4].equals(p4)).toBe(true);
    expect(a.planes[5].equals(p5)).toBe(true);

    // ensure it is a true copy by modifying source
    a.planes[0].copy(p1);
    expect(b.planes[0].equals(p0)).toBe(true);
  });

  test('copy', () => {
    const p0 = new Plane(unit3, -1);
    const p1 = new Plane(unit3, 1);
    const p2 = new Plane(unit3, 2);
    const p3 = new Plane(unit3, 3);
    const p4 = new Plane(unit3, 4);
    const p5 = new Plane(unit3, 5);

    const b = new Frustum(p0, p1, p2, p3, p4, p5);
    const a = new Frustum().copy(b);
    expect(a.planes[0].equals(p0)).toBe(true);
    expect(a.planes[1].equals(p1)).toBe(true);
    expect(a.planes[2].equals(p2)).toBe(true);
    expect(a.planes[3].equals(p3)).toBe(true);
    expect(a.planes[4].equals(p4)).toBe(true);
    expect(a.planes[5].equals(p5)).toBe(true);

    // ensure it is a true copy by modifying source
    b.planes[0] = p1;
    expect(a.planes[0].equals(p0)).toBe(true);
  });

  test('setFromProjectionMatrix/makeOrthographic/containsPoint', () => {
    const m = new Matrix4().makeOrthographic(-1, 1, 1, -1, 1, 100);
    const a = new Frustum().setFromProjectionMatrix(m);

    expect(a.containsPoint(new Vector3(0, 0, 0))).toBe(false);
    expect(a.containsPoint(new Vector3(0, 0, -50))).toBe(true);
    expect(a.containsPoint(new Vector3(0, 0, -1.001))).toBe(true);
    expect(a.containsPoint(new Vector3(-1, -1, -1.001))).toBe(true);
    expect(a.containsPoint(new Vector3(-1.1, -1.1, -1.001))).toBe(false);
    expect(a.containsPoint(new Vector3(1, 1, -1.001))).toBe(true);
    expect(a.containsPoint(new Vector3(1.1, 1.1, -1.001))).toBe(false);
    expect(a.containsPoint(new Vector3(0, 0, -99.999))).toBe(true);
    expect(a.containsPoint(new Vector3(-0.999, -0.999, -99.999))).toBe(true);
    expect(a.containsPoint(new Vector3(-1.1, -1.1, -100.1))).toBe(false);
    expect(a.containsPoint(new Vector3(0.999, 0.999, -99.999))).toBe(true);
    expect(a.containsPoint(new Vector3(1.1, 1.1, -100.1))).toBe(false);
    expect(a.containsPoint(new Vector3(0, 0, -101))).toBe(false);
  });

  test('setFromProjectionMatrix/makePerspective/containsPoint', () => {
    const m = new Matrix4().makePerspective(-1, 1, 1, -1, 1, 100);
    const a = new Frustum().setFromProjectionMatrix(m);

    expect(a.containsPoint(new Vector3(0, 0, 0))).toBe(false);
    expect(a.containsPoint(new Vector3(0, 0, -50))).toBe(true);
    expect(a.containsPoint(new Vector3(0, 0, -1.001))).toBe(true);
    expect(a.containsPoint(new Vector3(-1, -1, -1.001))).toBe(true);
    expect(a.containsPoint(new Vector3(-1.1, -1.1, -1.001))).toBe(false);
    expect(a.containsPoint(new Vector3(1, 1, -1.001))).toBe(true);
    expect(a.containsPoint(new Vector3(1.1, 1.1, -1.001))).toBe(false);
    expect(a.containsPoint(new Vector3(0, 0, -99.999))).toBe(true);
    expect(a.containsPoint(new Vector3(-99.999, -99.999, -99.999))).toBe(true);
    expect(a.containsPoint(new Vector3(-100.1, -100.1, -100.1))).toBe(false);
    expect(a.containsPoint(new Vector3(99.999, 99.999, -99.999))).toBe(true);
    expect(a.containsPoint(new Vector3(100.1, 100.1, -100.1))).toBe(false);
    expect(a.containsPoint(new Vector3(0, 0, -101))).toBe(false);
  });

  test('setFromProjectionMatrix/makePerspective/intersectsSphere', () => {
    const m = new Matrix4().makePerspective(-1, 1, 1, -1, 1, 100);
    const a = new Frustum().setFromProjectionMatrix(m);

    expect(a.intersectsSphere(new Sphere(new Vector3(0, 0, 0), 0))).toBe(false);
    expect(a.intersectsSphere(new Sphere(new Vector3(0, 0, 0), 0.9))).toBe(
      false
    );
    expect(a.intersectsSphere(new Sphere(new Vector3(0, 0, 0), 1.1))).toBe(
      true
    );
    expect(a.intersectsSphere(new Sphere(new Vector3(0, 0, -50), 0))).toBe(
      true
    );
    expect(a.intersectsSphere(new Sphere(new Vector3(0, 0, -1.001), 0))).toBe(
      true
    );
    expect(a.intersectsSphere(new Sphere(new Vector3(-1, -1, -1.001), 0))).toBe(
      true
    );
    expect(
      a.intersectsSphere(new Sphere(new Vector3(-1.1, -1.1, -1.001), 0))
    ).toBe(false);
    expect(
      a.intersectsSphere(new Sphere(new Vector3(-1.1, -1.1, -1.001), 0.5))
    ).toBe(true);
    expect(a.intersectsSphere(new Sphere(new Vector3(1, 1, -1.001), 0))).toBe(
      true
    );
    expect(
      a.intersectsSphere(new Sphere(new Vector3(1.1, 1.1, -1.001), 0))
    ).toBe(false);
    expect(
      a.intersectsSphere(new Sphere(new Vector3(1.1, 1.1, -1.001), 0.5))
    ).toBe(true);
    expect(a.intersectsSphere(new Sphere(new Vector3(0, 0, -99.999), 0))).toBe(
      true
    );
    expect(
      a.intersectsSphere(new Sphere(new Vector3(-99.999, -99.999, -99.999), 0))
    ).toBe(true);
    expect(
      a.intersectsSphere(new Sphere(new Vector3(-100.1, -100.1, -100.1), 0))
    ).toBe(false);
    expect(
      a.intersectsSphere(new Sphere(new Vector3(-100.1, -100.1, -100.1), 0.5))
    ).toBe(true);
    expect(
      a.intersectsSphere(new Sphere(new Vector3(99.999, 99.999, -99.999), 0))
    ).toBe(true);
    expect(
      a.intersectsSphere(new Sphere(new Vector3(100.1, 100.1, -100.1), 0))
    ).toBe(false);
    expect(
      a.intersectsSphere(new Sphere(new Vector3(100.1, 100.1, -100.1), 0.2))
    ).toBe(true);
    expect(a.intersectsSphere(new Sphere(new Vector3(0, 0, -101), 0))).toBe(
      false
    );
    expect(a.intersectsSphere(new Sphere(new Vector3(0, 0, -101), 1.1))).toBe(
      true
    );
  });

  test('intersectsBox', () => {
    const m = new Matrix4().makePerspective(-1, 1, 1, -1, 1, 100);
    const a = new Frustum().setFromProjectionMatrix(m);
    const box = new Box3(zero3.clone(), one3.clone());

    expect(a.intersectsBox(box)).toBe(false);

    // add eps so that we prevent box touching the frustum,
    // which might intersect depending on floating point numerics
    box.translate(new Vector3(-1 - eps, -1 - eps, -1 - eps));

    expect(a.intersectsBox(box)).toBe(true);
  });
});
