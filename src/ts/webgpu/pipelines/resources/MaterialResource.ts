import { GameManager } from "../../gameManager";
import { PipelineResourceTemplate } from "./PipelineResourceTemplate";
import { PipelineResourceInstance } from "./PipelineResourceInstance";

export class MaterialResource extends PipelineResourceTemplate {
  constructor(group: number, binding: number = 0) {
    super(group, binding);
  }

  initialize(manager: GameManager, pipeline: GPURenderPipeline): number {
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
