import { Event } from "./core/Event";
import { ApplicationEventType } from "../common/EventTypes";
import { Component } from "./core/Component";
import { Camera } from "./cameras/Camera";

export declare function onSignalReceived(type: ApplicationEventType, event: Event): void;
export declare function lock(): void;
export declare function unlock(): void;
export declare function setupLights(numLights: u32, config: usize, scene: usize, direction: usize): void;
export declare function renderComponents(camera: Camera, meshComponents: Component[]): void;