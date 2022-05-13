import { Event } from "./core/Event";
import { GPUBufferUsageFlags } from "../common/GPUEnums";
import { UIEventType } from "../common/UIEventType";

export declare function createBufferFromF32(data: usize, usage: GPUBufferUsageFlags): i32;
export declare function createIndexBuffer(data: usize, usage: GPUBufferUsageFlags): i32;
export declare function render(commandsIndex: usize): void;
export declare function onSignalReceived(type: UIEventType, event: Event): void;
export declare function lock(): void;
export declare function unlock(): void;
