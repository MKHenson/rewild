import { ApplicationEventType, Event } from "rewild-common";
import { Component } from "./core/Component";
import { Camera } from "./cameras/Camera";
import { TransformNode } from "./core/TransformNode";

export declare function onSignalReceived(
  type: ApplicationEventType,
  event: Event
): void;
export declare function performanceNow(): f32;
export declare function lock(): void;
export declare function unlock(): void;
export declare function createChunk(terrain: TransformNode): void;
export declare function initializeSkybox(skybox: TransformNode): void;
export declare function setupLights(
  numLights: u32,
  config: usize,
  scene: usize,
  direction: usize
): void;
export declare function renderComponents(
  camera: Camera,
  meshComponents: Component[]
): void;
