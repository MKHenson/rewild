import { __Internref24, __Internref33 } from '../../build/release';
import { ClientBodyOptions } from './ClientBodyOptions';
import { ClientQuat } from './ClientQuat';
import { ClientShape } from './ClientShape';
import { ClientVec3 } from './ClientVec3';
import { physicsWasm } from './WasmManager';

export class ClientBody {
  ptr: __Internref24;
  shapes: ClientShape[] = [];
  position: ClientVec3;
  quaternion: ClientQuat;
  interpolatedPosition: ClientVec3;
  interpolatedQuaternion: ClientQuat;

  constructor(options: ClientBodyOptions) {
    this.ptr = physicsWasm.createBody(options.ptr);
    this.position = new ClientVec3(physicsWasm.getBodyPosition(this.ptr));
    this.quaternion = new ClientQuat(physicsWasm.getBodyQuaternion(this.ptr));
    this.interpolatedPosition = new ClientVec3(
      physicsWasm.getBodyInterpolatedPosition(this.ptr)
    );
    this.interpolatedQuaternion = new ClientQuat(
      physicsWasm.getBodyInterpolatedQuaternion(this.ptr)
    );
  }

  get isTrigger(): boolean {
    return physicsWasm.isBodyTrigger(this.ptr);
  }

  get numShapeOffsets(): number {
    return physicsWasm.getBodyNumShapeOffsets(this.ptr);
  }

  get numShapeOrientations(): number {
    return physicsWasm.getBodyNumShapeOrientations(this.ptr);
  }

  getShapeOffsetAt(index: number): ClientVec3 {
    const vec3Ptr = physicsWasm.getBodyShapeOffsetAt(this.ptr, index);
    return new ClientVec3(vec3Ptr);
  }

  getShapeOrientationAt(index: number): ClientQuat {
    const quatPtr = physicsWasm.getBodyShapeOrientationAt(this.ptr, index);
    return new ClientQuat(quatPtr);
  }

  addShape(shape: ClientShape): ClientBody {
    physicsWasm.addShapeToBody(this.ptr, shape.ptr);
    this.shapes.push(shape);
    return this;
  }

  removeShape(shape: ClientShape): ClientBody {
    physicsWasm.removeShapeFromBody(this.ptr, shape.ptr);
    this.shapes = this.shapes.filter((s) => s !== shape);
    return this;
  }

  setPosition(x: number, y: number, z: number): ClientBody {
    physicsWasm.setBodyPosition(this.ptr, x, y, z);
    return this;
  }

  setQuaternion(x: number, y: number, z: number, w: number): ClientBody {
    physicsWasm.setBodyQuaternion(this.ptr, x, y, z, w);
    return this;
  }

  setQuaternionFromEuler(x: number, y: number, z: number): ClientBody {
    physicsWasm.setBodyQuaternionFromEuler(this.ptr, x, y, z);
    return this;
  }

  setVelocity(x: number, y: number, z: number): ClientBody {
    physicsWasm.setBodyVelocity(this.ptr, x, y, z);
    return this;
  }

  setAngularVelocity(x: number, y: number, z: number): ClientBody {
    physicsWasm.setBodyAngularVelocity(this.ptr, x, y, z);
    return this;
  }

  setMass(mass: number): ClientBody {
    physicsWasm.setBodyMass(this.ptr, mass);
    return this;
  }
}
