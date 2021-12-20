import { GPUBufferUsageFlags } from "../common/GPUEnums";
import { PipelineResourceType } from "../common/PipelineResourceType";

// prettier-ignore
// export declare function createUniformBuffer(pipeline: number, type: PipelineResourceType, size: number, labelPtr?: string): i32;
export declare function createBufferFromF32(data: Float32Array, usage: GPUBufferUsageFlags): i32;
export declare function createBuffer(data: Float32Array, usage: GPUBufferUsageFlags): i32;
export declare function createIndexBuffer(data: Uint32Array, usage: GPUBufferUsageFlags): i32;
export declare function render(commandsIndex: Array<i32>): void;
export declare function print(message: string): u32;
