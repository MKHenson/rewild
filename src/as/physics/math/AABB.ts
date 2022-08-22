import { Vec3 } from "./Vec3";

/**
 * An axis-aligned bounding box.
 *
 * @author saharan
 * @author lo-th
 */

export class AABB {
  elements: Float32Array;

  constructor(minX: f32 = 0, maxX: f32 = 0, minY: f32 = 0, maxY: f32 = 0, minZ: f32 = 0, maxZ: f32 = 0) {
    this.elements = new Float32Array(6);
    var te = this.elements;

    te[0] = minX || 0;
    te[1] = minY || 0;
    te[2] = minZ || 0;
    te[3] = maxX || 0;
    te[4] = maxY || 0;
    te[5] = maxZ || 0;
  }

  set(minX: f32, maxX: f32, minY: f32, maxY: f32, minZ: f32, maxZ: f32): AABB {
    var te = this.elements;
    te[0] = minX;
    te[3] = maxX;
    te[1] = minY;
    te[4] = maxY;
    te[2] = minZ;
    te[5] = maxZ;
    return this;
  }

  intersectTest(aabb: AABB): boolean {
    var te = this.elements;
    var ue = aabb.elements;
    return te[0] > ue[3] || te[1] > ue[4] || te[2] > ue[5] || te[3] < ue[0] || te[4] < ue[1] || te[5] < ue[2]
      ? true
      : false;
  }

  intersectTestTwo(aabb: AABB): boolean {
    var te = this.elements;
    var ue = aabb.elements;
    return te[0] < ue[0] || te[1] < ue[1] || te[2] < ue[2] || te[3] > ue[3] || te[4] > ue[4] || te[5] > ue[5]
      ? true
      : false;
  }

  clone(): AABB {
    return new AABB().fromArray32(this.elements);
  }

  copy(aabb: AABB, margin: f32 = 0): AABB {
    var m = margin;
    var me = aabb.elements;
    this.set(me[0] - m, me[3] + m, me[1] - m, me[4] + m, me[2] - m, me[5] + m);
    return this;
  }

  fromArray(array: f32[]): AABB {
    for (let i: i32 = 0, l = array.length; i < l; i++) {
      unchecked((this.elements[i] = unchecked(array[i])));
    }
    return this;
  }

  fromArray32(array: Float32Array): AABB {
    this.elements.set(array);
    return this;
  }

  // Set this AABB to the combined AABB of aabb1 and aabb2.

  combine(aabb1: AABB, aabb2: AABB): AABB {
    var a = aabb1.elements;
    var b = aabb2.elements;
    var te = this.elements;

    te[0] = a[0] < b[0] ? a[0] : b[0];
    te[1] = a[1] < b[1] ? a[1] : b[1];
    te[2] = a[2] < b[2] ? a[2] : b[2];

    te[3] = a[3] > b[3] ? a[3] : b[3];
    te[4] = a[4] > b[4] ? a[4] : b[4];
    te[5] = a[5] > b[5] ? a[5] : b[5];

    return this;
  }

  // Get the surface area.

  surfaceArea(): f32 {
    var te = this.elements;
    var a = te[3] - te[0];
    var h = te[4] - te[1];
    var d = te[5] - te[2];
    return 2 * (a * (h + d) + h * d);
  }

  // Get whether the AABB intersects with the point or not.

  intersectsWithPoint(x: f32, y: f32, z: f32): boolean {
    var te = this.elements;
    return x >= te[0] && x <= te[3] && y >= te[1] && y <= te[4] && z >= te[2] && z <= te[5];
  }

  /**
   * Set the AABB from an array
   * of vertices. From THREE.
   * @author WestLangley
   * @author xprogram
   */

  setFromPoints(arr: Vec3[]): void {
    this.makeEmpty();
    for (var i = 0; i < arr.length; i++) {
      this.expandByPoint(arr[i]);
    }
  }

  makeEmpty(): void {
    this.set(-Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity);
  }

  expandByPoint(pt: Vec3): void {
    var te = this.elements;
    this.set(
      Mathf.min(te[0], pt.x),
      Mathf.min(te[1], pt.y),
      Mathf.min(te[2], pt.z),
      Mathf.max(te[3], pt.x),
      Mathf.max(te[4], pt.y),
      Mathf.max(te[5], pt.z)
    );
  }

  expandByScalar(s: f32): void {
    var te = this.elements;
    te[0] += -s;
    te[1] += -s;
    te[2] += -s;
    te[3] += s;
    te[4] += s;
    te[5] += s;
  }
}
