import { __Internref24, __Internref33 } from '../../build/release';
import { ClientBodyOptions } from './ClientBodyOptions';
import { ClientShape } from './ClientShape';
import { physicsWasm } from './WasmManager';

export class ClientBody {
  ptr: __Internref24;

  constructor(options: ClientBodyOptions) {
    this.ptr = physicsWasm.createBody(options.ptr);
  }

  addShape(shape: ClientShape): ClientBody {
    physicsWasm.addShapeToBody(this.ptr, shape.ptr);
    return this;
  }

  removeShape(shape: ClientShape): ClientBody {
    physicsWasm.removeShapeFromBody(this.ptr, shape.ptr);
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
