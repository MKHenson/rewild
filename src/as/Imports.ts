import { Event } from "./core/Event";
import { GPUBufferUsageFlags } from "../common/GPUEnums";
import { UIEventType } from "../common/UIEventType";

export declare function createBufferFromF32(data: Float32Array, usage: GPUBufferUsageFlags): i32;
export declare function createBuffer(data: Float32Array, usage: GPUBufferUsageFlags): i32;
export declare function createIndexBuffer(data: Uint32Array, usage: GPUBufferUsageFlags): i32;
export declare function render(commandsIndex: Array<i32>): void;
export declare function print(message: string): u32;
export declare function onSignalReceived(type: UIEventType, event: Event): void;
