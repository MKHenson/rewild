import { GroupType } from "../../common/GroupType";
import { ResourceType } from "../../common/ResourceType";
import { GPUCommands } from "../../common/Commands";
import { GameManager } from "./GameManager";
import { Pipeline } from "./pipelines/Pipeline";
import { LightingResource } from "./pipelines/resources/LightingResource";
import { PipelineResourceInstance } from "./pipelines/resources/PipelineResourceInstance";
import { wasmManager } from "./WasmManager";
import { TransformResource } from "./pipelines/resources/TransformResource";

const ARRAYBUFFERVIEW_DATASTART_OFFSET = 4;
const normalAs4x4 = new Float32Array(12);

export class RenderQueueManager {
  manager: GameManager;

  constructor(manager: GameManager) {
    this.manager = manager;
  }

  run(commandBuffer: Array<number>) {
    const manager = this.manager;
    const device = manager.device;
    const { wasmArrayBuffer, wasmMemoryBlock } = wasmManager;

    const getPtrIndex = function (ptr: number) {
      return wasmArrayBuffer[(ptr + ARRAYBUFFERVIEW_DATASTART_OFFSET) >>> 2];
    };

    let pipeline: Pipeline<any>, buffer: GPUBuffer, instances: PipelineResourceInstance[], resourceIndex: number;

    let pass = manager.currentPass!;

    for (let i = 0, l = commandBuffer.length; i < l; i++) {
      const command = commandBuffer[i];

      switch (command) {
        case GPUCommands.SETUP_LIGHTING:
          const numDirectionLights = commandBuffer[i + 1];

          if (LightingResource.numDirLights !== numDirectionLights) {
            LightingResource.numDirLights = numDirectionLights;
            LightingResource.rebuildDirectionLights = true;
            this.manager.pipelines.forEach((p) => {
              if (p.getTemplateByType(ResourceType.Material)) {
                p.defines = { ...p.defines, NUM_DIR_LIGHTS: numDirectionLights };
              }
            });
          }

          buffer = LightingResource.lightingConfig;
          if (buffer) {
            const info = getPtrIndex(commandBuffer[i + 2]);
            device.queue.writeBuffer(buffer, 0, wasmMemoryBlock, info, 4);
          }

          buffer = LightingResource.sceneLightingBuffer;
          if (buffer) {
            const ambientLights = getPtrIndex(commandBuffer[i + 3]);
            device.queue.writeBuffer(buffer, 0, wasmMemoryBlock, ambientLights, 4 * 4);
          }

          buffer = LightingResource.directionLightsBuffer;
          if (buffer) {
            const dirLights = getPtrIndex(commandBuffer[i + 4]);
            device.queue.writeBuffer(buffer, 0, wasmMemoryBlock, dirLights, numDirectionLights * 4 * 4 * 2);
          }

          i += 4;
          break;

        case GPUCommands.SET_TRANSFORM:
          const template = pipeline!.getTemplateByGroup(GroupType.Transform)! as TransformResource;
          instances = pipeline!.groupInstances.get(GroupType.Transform)!;
          resourceIndex = commandBuffer[i + 1];
          const projMatrixPtr = getPtrIndex(commandBuffer[i + 2]);
          const mvMatrixPtr = getPtrIndex(commandBuffer[i + 3]);
          const mMatrixPtr = getPtrIndex(commandBuffer[i + 4]);
          const normMatrixPtr = getPtrIndex(commandBuffer[i + 5]);

          const mat3x3 = new Float32Array(wasmMemoryBlock, normMatrixPtr, 9);

          // TODO: Make this neater
          normalAs4x4[0] = mat3x3[0];
          normalAs4x4[1] = mat3x3[1];
          normalAs4x4[2] = mat3x3[2];

          normalAs4x4[4] = mat3x3[3];
          normalAs4x4[5] = mat3x3[4];
          normalAs4x4[6] = mat3x3[5];

          normalAs4x4[8] = mat3x3[6];
          normalAs4x4[9] = mat3x3[7];
          normalAs4x4[10] = mat3x3[8];

          const transformBuffer = instances[resourceIndex].buffers![0];

          if (template.projectionOffset !== -1)
            device.queue.writeBuffer(transformBuffer, template.projectionOffset, wasmMemoryBlock, projMatrixPtr, 64);
          if (template.modelViewOffset !== -1)
            device.queue.writeBuffer(transformBuffer, template.modelViewOffset, wasmMemoryBlock, mvMatrixPtr, 64);
          if (template.modelOffset !== -1)
            device.queue.writeBuffer(transformBuffer, template.modelOffset, wasmMemoryBlock, mMatrixPtr, 64);
          if (template.normalOffset !== -1)
            device.queue.writeBuffer(transformBuffer, template.normalOffset, normalAs4x4);
          i += 5;
          break;

        case GPUCommands.SET_INDEX_BUFFER:
          buffer = manager.buffers[commandBuffer[i + 1]];
          pass.setIndexBuffer(buffer, "uint32");
          i += 1;
          break;

        case GPUCommands.SET_BUFFER:
          const slot = commandBuffer[i + 1];
          buffer = manager.buffers[commandBuffer[i + 2]];
          pass.setVertexBuffer(slot, buffer);
          i += 2;
          break;

        case GPUCommands.DRAW_INDEXED:
          const indexCount = commandBuffer[i + 1];
          pass.drawIndexed(indexCount);
          i += 1;
          break;

        case GPUCommands.SET_PIPELINE:
          const newPipeline = manager.pipelines[commandBuffer[i + 1]];

          if (newPipeline.rebuild) {
            newPipeline.build(manager);
            newPipeline.initialize(manager);
          }

          if (newPipeline === pipeline!) {
            i += 1;
            break;
          }

          pipeline = newPipeline;

          pass.setPipeline(pipeline.renderPipeline!);
          i += 1;
          break;

        case GPUCommands.SET_BIND_GROUP:
          instances = pipeline!.groupInstances.get(commandBuffer[i + 1])!;
          const instance = instances?.[commandBuffer[i + 2]];
          if (instance) pass.setBindGroup(instance.group, instance.bindGroup);

          i += 2;
          break;

        case GPUCommands.START_PASS:
          manager.startPass();
          pass = manager.currentPass!;
          break;

        case GPUCommands.END_PASS:
          manager.endPass();
          break;
      }
    }
  }
}
