import { GameManager } from "../../gameManager";
import { UNIFORM_TYPES_MAP } from "./memoryUtils";
import { PipelineResource } from "./PipelineResource";

export class LightingResource extends PipelineResource {
  static lightingConfig: GPUBuffer;
  static directionLightsBuffer: GPUBuffer;
  static sceneLightingBuffer: GPUBuffer;

  static numDirLights: number = 0;
  static rebuildDirectionLights = true;

  constructor(group: number, binding: number = 0) {
    super(group, binding, true);
  }

  initialize(manager: GameManager, pipeline: GPURenderPipeline): GPUBindGroup {
    if (!LightingResource.lightingConfig) {
      const LIGHTING_CONFIG_SIZE = UNIFORM_TYPES_MAP["u32"];
      const SCENE_LIGHTING_BUFFER = UNIFORM_TYPES_MAP["vec4<f32>"];

      LightingResource.lightingConfig = manager.device.createBuffer({
        label: "lightingConfigUniform",
        size: LIGHTING_CONFIG_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });

      LightingResource.sceneLightingBuffer = manager.device.createBuffer({
        label: "sceneLightingBuffer",
        size: SCENE_LIGHTING_BUFFER,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });

      // Defaults for lighting info
      // prettier-ignore
      const lightInofoDefaults = new Uint32Array([
        0, // Num Directional lights
      ]);

      // Defaults for scene lights buffer
      // prettier-ignore
      const sceneLightingBufferDefaults = new  Float32Array([
        0.4, 0.4, 0.4, 0, // Ambient Light Color
      ]);

      // Set defaults
      new Float32Array(LightingResource.lightingConfig.getMappedRange()).set(lightInofoDefaults);
      LightingResource.lightingConfig.unmap();

      new Float32Array(LightingResource.sceneLightingBuffer.getMappedRange()).set(sceneLightingBufferDefaults);
      LightingResource.sceneLightingBuffer.unmap();
    }

    if (LightingResource.rebuildDirectionLights) {
      LightingResource.rebuildDirectionLights = false;

      if (LightingResource.directionLightsBuffer) LightingResource.directionLightsBuffer.destroy();

      LightingResource.directionLightsBuffer = manager.device.createBuffer({
        label: "dirLightsBuffer",
        size: UNIFORM_TYPES_MAP["vec4<f32>"] * 2 * LightingResource.numDirLights,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    const bindGroup = manager.device.createBindGroup({
      label: "lighting",
      layout: pipeline.getBindGroupLayout(this.group),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: LightingResource.lightingConfig,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: LightingResource.directionLightsBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: LightingResource.sceneLightingBuffer,
          },
        },
      ],
    });

    return bindGroup;
  }

  clone(): PipelineResource {
    return new LightingResource(this.group, this.binding);
  }

  dispose() {
    super.dispose();
  }
}
