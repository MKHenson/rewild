import { Renderer } from "../../../renderer/Renderer";
import { UNIFORM_TYPES_MAP } from "./MemoryUtils";
import { BindingData, PipelineResourceTemplate, Template } from "./PipelineResourceTemplate";
import { GroupType, ResourceType } from "@rewild/common";
import { Defines } from "../shader-lib/Utils";
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
    super(GroupType.Material, ResourceType.Lighting);
  }

  build<T extends Defines<T>>(renderer: Renderer, pipeline: Pipeline<T>, curBindIndex: number): Template {
    this.lightingConfigBinding = curBindIndex;
    this.sceneLightingBinding = curBindIndex + 1;
    this.directionLightBinding = pipeline.defines.NUM_DIR_LIGHTS ? curBindIndex + 2 : -1;
    const group = pipeline.groupIndex(this.groupType);

    if (!LightingResource.lightingConfig) {
      const LIGHTING_CONFIG_SIZE = UNIFORM_TYPES_MAP["u32"];
      const SCENE_LIGHTING_BUFFER = UNIFORM_TYPES_MAP["vec4<f32>"];

      LightingResource.lightingConfig = renderer.device.createBuffer({
        label: "lightingConfigUniform",
        size: LIGHTING_CONFIG_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });

      LightingResource.sceneLightingBuffer = renderer.device.createBuffer({
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
        0.0, 0.0, 0.0, 0, // Ambient Light Color
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

      LightingResource.directionLightsBuffer = renderer.device.createBuffer({
        label: "dirLightsBuffer",
        size: UNIFORM_TYPES_MAP["vec4<f32>"] * 2 * LightingResource.numDirLights,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    // prettier-ignore
    return {
      group,
      bindings: [ { buffer: LightingResource.lightingConfig, }, { buffer: LightingResource.sceneLightingBuffer },
      ].concat(LightingResource.numDirLights ? { buffer: LightingResource.directionLightsBuffer } : []),

      fragmentBlock: `struct SceneLightingUniform {
        ambientLightColor: vec4<f32>
      };

      struct LightingConfigUniform {
        numDirectionalLights: u32
      };

      @group(${group}) @binding(${this.lightingConfigBinding})
      var<uniform> lightingConfigUniform: LightingConfigUniform;

      @group(${group}) @binding(${this.sceneLightingBinding})
      var<uniform> sceneLightingUniform: SceneLightingUniform;


      ${pipeline.defines.NUM_DIR_LIGHTS ? `
      struct DirectionLightUniform {
        direction : vec4<f32>,
        color : vec4<f32>
      };

      struct DirectionLightsUniform {
        directionalLights: array<DirectionLightUniform>
      };

      @group(${group}) @binding(${this.directionLightBinding})
      var<storage, read> directionLightsUniform: DirectionLightsUniform;
      ` : ''}
      `,
      vertexBlock: null,
    };
  }

  getBindingData(renderer: Renderer, pipeline: GPURenderPipeline): BindingData {
    return {
      binds: [
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
      buffer: null,
    };
  }
}
