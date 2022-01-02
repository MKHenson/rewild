import { GameManager } from "../../GameManager";
import { PipelineResourceTemplate, Template } from "./PipelineResourceTemplate";
import { PipelineResourceInstance } from "./PipelineResourceInstance";
import { Defines } from "../shader-lib/Utils";
import { Pipeline } from "../Pipeline";
import { GroupType } from "../../../../common/GroupType";

export class MaterialResource extends PipelineResourceTemplate {
  binding: number;

  constructor() {
    super(GroupType.Material);
  }

  build<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>, curBindIndex: number): Template {
    this.binding = curBindIndex;
    const group = pipeline.groupIndex(this.groupType);

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

    return {
      group,
      bindings: [resource],
      // prettier-ignore
      fragmentBlock: `
      struct MaterialData {
        diffuse: vec4<f32>;
        emissive: vec4<f32>;
        opacity: f32;
        metalness: f32;
        roughness: f32;
      };

      [[group(${group}), binding(${curBindIndex})]] var<uniform> materialData: MaterialData;
      `,
      vertexBlock: null,
    };
  }

  initialize<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number {
    return 1;
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
      layout: pipeline.getBindGroupLayout(this.template.group),
      entries: [
        {
          binding: this.binding,
          resource,
        },
      ],
    });

    return new PipelineResourceInstance(this.template.group, bindGroup, buffer);
  }
}
