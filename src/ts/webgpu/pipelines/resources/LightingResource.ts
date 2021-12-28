import { GameManager } from "../../gameManager";
import { UNIFORM_TYPES_MAP } from "./memoryUtils";
import { PipelineResourceTemplate } from "./PipelineResourceTemplate";
import { PipelineResourceInstance } from "./PipelineResourceInstance";
import { GroupType } from "../../../../common/GroupType";
import { Defines } from "../shader-lib/utils";
import { Pipeline } from "../Pipeline";

export class LightingResource extends PipelineResourceTemplate {
  static lightingConfig: GPUBuffer;
  static directionLightsBuffer: GPUBuffer;
  static sceneLightingBuffer: GPUBuffer;

  static numDirLights: number = 0;
  static rebuildDirectionLights = true;

  directionLightBinding: number;
  lightingConfigBinding: number;
  sceneLightingBinding: number;

  constructor() {
    super();
  }

  build<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number {
    this.directionLightBinding = pipeline.bindingIndex(GroupType.Lighting);
    this.lightingConfigBinding = pipeline.bindingIndex(GroupType.Lighting);
    this.sceneLightingBinding = pipeline.bindingIndex(GroupType.Lighting);

    return pipeline.groupIndex(GroupType.Lighting);
  }

  initialize<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number {
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

    if (LightingResource.rebuildDirectionLights && LightingResource.numDirLights > 0) {
      LightingResource.rebuildDirectionLights = false;

      if (LightingResource.directionLightsBuffer) LightingResource.directionLightsBuffer.destroy();

      LightingResource.directionLightsBuffer = manager.device.createBuffer({
        label: "dirLightsBuffer",
        size: UNIFORM_TYPES_MAP["vec4<f32>"] * 2 * LightingResource.numDirLights,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    return 1;
  }

  getResourceHeader<T extends Defines<T>>(pipeline: Pipeline<T>) {
    // prettier-ignore
    return `struct SceneLightingUniform {
      ambientLightColor: vec4<f32>;
    };

    struct LightingConfigUniform {
      numDirectionalLights: u32;
    };

    ${pipeline.defines.NUM_DIR_LIGHTS ? `
    struct DirectionLightUniform {
      direction : vec4<f32>;
      color : vec4<f32>;
    };

    struct DirectionLightsUniform {
      directionalLights: array<DirectionLightUniform>;
    };

    [[group(${this.group}), binding(${this.directionLightBinding})]] var<storage, read> directionLightsUniform: DirectionLightsUniform;
    ` : ''}

    [[group(${this.group}), binding(${this.lightingConfigBinding})]] var<uniform> lightingConfigUniform: LightingConfigUniform;
    [[group(${this.group}), binding(${this.sceneLightingBinding})]] var<uniform> sceneLightingUniform: SceneLightingUniform;
    `;
  }

  createInstance(manager: GameManager, pipeline: GPURenderPipeline): PipelineResourceInstance {
    const bindGroup = manager.device.createBindGroup({
      label: "lighting",
      layout: pipeline.getBindGroupLayout(this.group),
      entries: [
        {
          binding: this.lightingConfigBinding,
          resource: {
            buffer: LightingResource.lightingConfig,
          },
        },
        {
          binding: this.sceneLightingBinding,
          resource: {
            buffer: LightingResource.sceneLightingBuffer,
          },
        },
      ].concat(
        LightingResource.numDirLights
          ? {
              binding: this.directionLightBinding,
              resource: {
                buffer: LightingResource.directionLightsBuffer,
              },
            }
          : []
      ),
    });

    return new PipelineResourceInstance(this.group, bindGroup);
  }
}
