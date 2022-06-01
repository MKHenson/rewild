import { Event } from "./core/Event";
import { GPUBufferUsageFlags } from "../common/GPUEnums";
import { UIEventType } from "../common/UIEventType";
import { Component } from "./core/Component";
import { Camera } from "./cameras/Camera";

export declare function createBufferFromF32(data: usize, usage: GPUBufferUsageFlags): i32;
export declare function createIndexBuffer(data: usize, usage: GPUBufferUsageFlags): i32;
export declare function render(commandsIndex: usize): void;
export declare function onSignalReceived(type: UIEventType, event: Event): void;
export declare function lock(): void;
export declare function unlock(): void;
export declare function setupLights(numLights: u32, config: usize, scene: usize, direction: usize): void;
export declare function renderComponents(camera: Camera, meshComponents: Component[]): void;
