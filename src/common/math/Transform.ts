/**
 * @author schteppe
 * @author MathewKHenson
 */

import { Vector3 } from "./Vector3";
import { Quaternion } from "./Quaternion";

export class Transform {
  position: Vector3;
  quaternion: Quaternion;

  constructor(position = new Vector3(), quaternion = new Quaternion()) {
    this.position = position;
    this.quaternion = quaternion;
  }

  /**
   * @static
   * @method pointToLocaFrame
   * @param {Vec3} position
   * @param {Quaternion} quaternion
   * @param {Vec3} worldPoint
   * @param {Vec3} result
   */
  static pointToLocalFrame(position: Vector3, quaternion: Quaternion, worldPoint: Vector3, result: Vector3): Vector3 {
    var result = result || new Vector3();
    result.subVectors(worldPoint, position);
    // quaternion.conjugate(tmpQuat);
    quaternion.copy(tmpQuat).conjugate();
    // tmpQuat.vmult(result, result);
    result.applyQuaternion(tmpQuat);

    return result;
  }

  /**
   * @static
   * @method pointToWorldFrame
   * @param {Vec3} position
   * @param {Vec3} quaternion
   * @param {Vec3} localPoint
   * @param {Vec3} result
   */
  static pointToWorldFrame(position: Vector3, quaternion: Quaternion, localPoint: Vector3, result: Vector3): Vector3 {
    var result = result || new Vector3();
    // quaternion.vmult(localPoint, result);
    result.copy(localPoint).applyQuaternion(quaternion);
    // result.vadd(position, result);
    result.add(position);
    return result;
  }

  static vectorToWorldFrame(quaternion: Quaternion, localVector: Vector3, result: Vector3): Vector3 {
    // quaternion.vmult(localVector, result);
    result.copy(localVector).applyQuaternion(quaternion);
    return result;
  }

  static vectorToLocalFrame(position: Vector3, quaternion: Quaternion, worldVector: Vector3, result: Vector3): Vector3 {
    var result = result || new Vector3();
    quaternion.w *= -1;
    // quaternion.vmult(worldVector, result);
    result.copy(worldVector).applyQuaternion(quaternion);
    quaternion.w *= -1;
    return result;
  }

  /**
   * Get a global point in local transform coordinates.
   * @method pointToLocal
   * @param  {Vec3} point
   * @param  {Vec3} result
   * @return {Vec3} The "result" vector object
   */
  pointToLocal(worldPoint: Vector3, result: Vector3): Vector3 {
    return Transform.pointToLocalFrame(this.position, this.quaternion, worldPoint, result);
  }

  /**
   * Get a local point in global transform coordinates.
   * @method pointToWorld
   * @param  {Vec3} point
   * @param  {Vec3} result
   * @return {Vec3} The "result" vector object
   */
  pointToWorld(localPoint: Vector3, result: Vector3): Vector3 {
    return Transform.pointToWorldFrame(this.position, this.quaternion, localPoint, result);
  }

  vectorToWorldFrame(localVector: Vector3, result: Vector3): Vector3 {
    var result = result || new Vector3();
    // this.quaternion.vmult(localVector, result);
    result.copy(localVector).applyQuaternion(this.quaternion);
    return result;
  }
}

const tmpQuat = new Quaternion();
