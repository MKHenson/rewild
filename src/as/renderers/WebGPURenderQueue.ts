import { print, render } from "../Imports";
import { GPUCommands } from "../../common/Commands";
import { GroupType } from "../../common/GroupType";
import { WebGPULights } from "./WebGPULights";

export class WebGPURenderQueue {
  q: Array<i32>;

  constructor() {
    this.q = new Array<i32>();
  }

  begin(): WebGPURenderQueue {
    this.q.splice(0, this.q.length);
    return this;
  }

  push(): WebGPURenderQueue {
    render(this.q);
    return this;
  }

  setTransform(
    transformIndex: i32,
    projectionMatrix: Float32Array,
    modelViewMatrix: Float32Array,
    normalMatrix: Float32Array
  ): WebGPURenderQueue {
    const q = this.q;
    q.push(GPUCommands.SET_TRANSFORM);
    q.push(transformIndex);
    q.push(changetype<i32>(projectionMatrix));
    q.push(changetype<i32>(modelViewMatrix));
    q.push(changetype<i32>(normalMatrix));
    return this;
  }

  setupLighting(lighting: WebGPULights): WebGPURenderQueue {
    const q = this.q;
    q.push(GPUCommands.SETUP_LIGHTING);
    q.push(lighting.numDirectionLights);
    q.push(changetype<i32>(lighting.lightingConfigBuffer));
    q.push(changetype<i32>(lighting.sceneLightsBuffer));
    q.push(changetype<i32>(lighting.directionLightsBuffer));
    return this;
  }

  setBindGroupResource(type: GroupType, resourceIndex: u32 = 0): WebGPURenderQueue {
    const q = this.q;
    q.push(GPUCommands.SET_BIND_GROUP);
    q.push(type);
    q.push(resourceIndex);
    return this;
  }

  setPipeline(pipeline: i32): WebGPURenderQueue {
    const q = this.q;
    q.push(GPUCommands.SET_PIPELINE);
    q.push(pipeline);
    return this;
  }

  drawIndexed(indexCount: i32): WebGPURenderQueue {
    const q = this.q;
    q.push(GPUCommands.DRAW_INDEXED);
    q.push(indexCount);
    return this;
  }

  startPass(): WebGPURenderQueue {
    const q = this.q;
    q.push(GPUCommands.START_PASS);
    return this;
  }

  endPass(): WebGPURenderQueue {
    const q = this.q;
    q.push(GPUCommands.END_PASS);
    return this;
  }

  setIndexBuffer(buffer: i32): WebGPURenderQueue {
    const q = this.q;
    q.push(GPUCommands.SET_INDEX_BUFFER);
    q.push(buffer);
    return this;
  }

  setBuffer(slot: i32, buffer: i32): WebGPURenderQueue {
    const q = this.q;
    q.push(GPUCommands.SET_BUFFER);
    q.push(slot);
    q.push(buffer);
    return this;
  }
}
