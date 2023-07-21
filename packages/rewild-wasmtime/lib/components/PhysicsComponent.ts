import { wasm } from "../WasmManager";
import { Component } from "./Component";

export class PhysicsComponent extends Component {
  propertiesView: Float32Array;

  constructor() {
    super(wasm.createPhysicsComponent(wasm.createBodyBall(1, 30)));
    this.propertiesView = wasm.getFloat32Array(
      wasm.getPhysicsComponentProperties(this.pointer)
    );
  }

  get positionX(): f32 {
    return this.propertiesView[0];
  }
  set positionX(val: f32) {
    this.propertiesView[0] = val;
  }

  get positionY(): f32 {
    return this.propertiesView[1];
  }
  set positionY(val: f32) {
    this.propertiesView[1] = val;
  }

  get positionZ(): f32 {
    return this.propertiesView[2];
  }
  set positionZ(val: f32) {
    this.propertiesView[2] = val;
  }

  get velocityX(): f32 {
    return this.propertiesView[3];
  }
  set velocityX(val: f32) {
    this.propertiesView[3] = val;
  }

  get velocityY(): f32 {
    return this.propertiesView[4];
  }
  set velocityY(val: f32) {
    this.propertiesView[4] = val;
  }

  get velocityZ(): f32 {
    return this.propertiesView[5];
  }
  set velocityZ(val: f32) {
    this.propertiesView[5] = val;
  }

  get angularVelocityX(): f32 {
    return this.propertiesView[6];
  }
  set angularVelocityX(val: f32) {
    this.propertiesView[6] = val;
  }

  get angularVelocityY(): f32 {
    return this.propertiesView[7];
  }
  set angularVelocityY(val: f32) {
    this.propertiesView[7] = val;
  }

  get angularVelocityZ(): f32 {
    return this.propertiesView[8];
  }
  set angularVelocityZ(val: f32) {
    this.propertiesView[8] = val;
  }

  get mass(): f32 {
    return this.propertiesView[9];
  }
  set mass(val: f32) {
    this.propertiesView[9] = val;
  }
}
