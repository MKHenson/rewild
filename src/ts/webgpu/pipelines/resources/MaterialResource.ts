import { GameManager } from "../../gameManager";
import { PipelineResourceTemplate } from "./PipelineResourceTemplate";
import { PipelineResourceInstance } from "./PipelineResourceInstance";
import { Defines } from "../shader-lib/utils";
import { Pipeline } from "../Pipeline";
import { GroupType } from "../../../../common/GroupType";

export class MaterialResource extends PipelineResourceTemplate {
  binding: number;

  constructor() {
    super();
  }

  build<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number {
    this.binding = pipeline.bindingIndex(GroupType.Material);
    return pipeline.groupIndex(GroupType.Material);
  }

  initialize<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number {
    return 1;
  }

  getResourceHeader<T extends Defines<T>>(pipeline: Pipeline<T>) {
    // prettier-ignore
    return `
    struct MaterialData {
      diffuse: vec4<f32>;
      emissive: vec4<f32>;
      opacity: f32;
      metalness: f32;
      roughness: f32;
    };

    [[group(${this.group}), binding(${this.binding})]] var<uniform> materialData: MaterialData;
    `;
  }

  createInstance(manager: GameManager, pipeline: GPURenderPipeline): PipelineResourceInstance {
    // prettier-ignore
    const initialValues = new Float32Array([
      1, 1, 1, 0,         // Diffuse
      0.1, 0.1, 0.1, 0,   // Emissive
      1,                  // Alpha
      0,                  // Metalness
      0.5                 // Roughness
    ]);
    const SIZE = Float32Array.BYTES_PER_ELEMENT * initialValues.length;

    const buffer = manager.device.createBuffer({
      label: "materialData",
      size: SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    // Set defaults
    new Float32Array(buffer.getMappedRange()).set(initialValues);
    buffer.unmap();

    const resource: GPUBindingResource = {
      buffer: buffer,
      offset: 0,
      size: SIZE,
    };

    const bindGroup = manager.device.createBindGroup({
      label: "materialData",
      layout: pipeline.getBindGroupLayout(this.group),
      entries: [
        {
          binding: this.binding,
          resource,
        },
      ],
    });

    return new PipelineResourceInstance(this.group, bindGroup, buffer);
  }
}
