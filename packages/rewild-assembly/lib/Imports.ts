import { ApplicationEventType, Event } from 'rewild-common';
import { Component } from './core/Component';
import { Camera } from './cameras/Camera';
import { TransformNode } from './core/TransformNode';
import { TerrainChunk } from './objects/terrain/TerrainChunk';

export declare function onSignalReceived(
  type: ApplicationEventType,
  event: Event
): void;
export declare function performanceNow(): f32;
export declare function lock(): void;
export declare function unlock(): void;
export declare function createChunk(
  terrain: TransformNode,
  chunk: TerrainChunk
): void;
export declare function debugF32Array(array: Float32Array): void;
export declare function debugI32Array(array: Int32Array): void;
export declare function debugUI32Array(array: Uint32Array): void;
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
