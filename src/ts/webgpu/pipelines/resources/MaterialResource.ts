import { GameManager } from "../../gameManager";
import { PipelineResource } from "./PipelineResource";

export class MaterialResource extends PipelineResource {
  buffer: GPUBuffer;

  constructor(group: number, binding: number = 0) {
    super(group, binding, true);
  }

  initialize(manager: GameManager, pipeline: GPURenderPipeline): GPUBindGroup {
    // prettier-ignore
    const initialValues = new Float32Array([
      1, 1, 1, 0,         // Diffuse
      0.1, 0.1, 0.1, 0,   // Emissive
      1,                  // Alpha
      0,                  // Metalness
      0.5                 // Roughness
    ]);
    const SIZE = Float32Array.BYTES_PER_ELEMENT * initialValues.length;

    this.buffer = manager.device.createBuffer({
      label: "materialData",
      size: SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    // Set defaults
    new Float32Array(this.buffer.getMappedRange()).set(initialValues);
    this.buffer.unmap();

    const resource: GPUBindingResource = {
      buffer: this.buffer,
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

    return bindGroup;
  }

  clone(): PipelineResource {
    return new MaterialResource(this.group, this.binding);
  }

  dispose() {
    super.dispose();
    this.buffer?.destroy();
  }
}
