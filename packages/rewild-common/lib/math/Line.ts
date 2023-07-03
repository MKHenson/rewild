import { Matrix4 } from "./Matrix4";
import { Vector3 } from "./Vector3";
import * as MathUtils from "./MathUtils";

const _startP = new Vector3();
const _startEnd = new Vector3();

export class Line3 {
  start: Vector3;
  end: Vector3;

  constructor(start: Vector3 = new Vector3(), end: Vector3 = new Vector3()) {
    this.start = start;
    this.end = end;
  }

  set(start: Vector3, end: Vector3): Line3 {
    this.start.copy(start);
    this.end.copy(end);

    return this;
  }

  copy(line: Line3): Line3 {
    this.start.copy(line.start);
    this.end.copy(line.end);

    return this;
  }

  getCenter(target: Vector3): Vector3 {
    return target.addVectors(this.start, this.end).multiplyScalar(0.5);
  }

  delta(target: Vector3): Vector3 {
    return target.subVectors(this.end, this.start);
  }

  distanceSq(): f32 {
    return this.start.distanceToSquared(this.end);
  }

  distance(): f32 {
    return this.start.distanceTo(this.end);
  }

  at(t: f32, target: Vector3): Vector3 {
    return this.delta(target).multiplyScalar(t).add(this.start);
  }

  closestPointToPointParameter(point: Vector3, clampToLine: boolean): f32 {
    _startP.subVectors(point, this.start);
    _startEnd.subVectors(this.end, this.start);

    const startEnd2: f32 = _startEnd.dot(_startEnd);
    const startEnd_startP: f32 = _startEnd.dot(_startP);

    let t = startEnd_startP / startEnd2;

    if (clampToLine) {
      t = MathUtils.clamp(t, 0, 1);
    }

    return t;
  }

  closestPointToPoint(point: Vector3, clampToLine: boolean, target: Vector3 = new Vector3()): Vector3 {
    const t = this.closestPointToPointParameter(point, clampToLine);

    return this.delta(target).multiplyScalar(t).add(this.start);
  }

  applyMatrix4(matrix: Matrix4): Line3 {
    this.start.applyMatrix4(matrix);
    this.end.applyMatrix4(matrix);

    return this;
  }

  equals(line: Line3): boolean {
    return line.start.equals(this.start) && line.end.equals(this.end);
  }

  clone(): Line3 {
    return new Line3().copy(this);
  }
}
