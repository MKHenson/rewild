import { Camera } from "../../cameras/Camera";
import { Light } from "../../lights/Light";
import { LightShadow } from "../../lights/LightShadow";
import { Scene } from "../../scenes/Scene";
import { WebGLLights } from "./WebGLLights";

export class WebGLRenderState {
  lights: WebGLLights;
  lightsArray: Light[];
  shadowsArray: LightShadow[];

  constructor() {
    this.lightsArray = [];
    this.shadowsArray = [];
    this.lights = new WebGLLights();
  }

  init(): void {
    this.lightsArray = [];
    this.shadowsArray = [];
  }

  pushLight(light: Light): void {
    this.lightsArray.push(light);
  }

  pushShadow(shadowLight: LightShadow): void {
    this.shadowsArray.push(shadowLight);
  }

  setupLights(physicallyCorrectLights: boolean): void {
    this.lights.setup(this.lightsArray, physicallyCorrectLights);
  }

  setupLightsView(camera: Camera): void {
    this.lights.setupView(this.lightsArray, camera);
  }

  // get state() {
  //   return {
  //     lightsArray: this.lightsArray,
  //     shadowsArray: this.shadowsArray,
  //     lights: this.lights,
  //   };
  // }
}

export class WebGLRenderStates {
  renderStates: Map<Scene, WebGLRenderState[]>;

  constructor() {
    this.renderStates = new Map();
  }

  get(scene: Scene, renderCallDepth: i32 = 0): WebGLRenderState {
    let renderState: WebGLRenderState | null = null;
    const renderStates = this.renderStates;

    if (renderStates.has(scene) == false) {
      renderState = new WebGLRenderState();
      renderStates.set(scene, [renderState]);
    } else {
      if (renderCallDepth >= renderStates.get(scene).length) {
        renderState = new WebGLRenderState();
        renderStates.get(scene).push(renderState);
      } else {
        renderState = renderStates.get(scene)[renderCallDepth];
      }
    }

    return renderState;
  }

  dispose(): void {
    this.renderStates = new Map();
  }
}
