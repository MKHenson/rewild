import { Renderer } from "../../../renderer/Renderer";
import { BindingData, PipelineResourceTemplate, Template } from "./PipelineResourceTemplate";
import { Defines } from "../shader-lib/Utils";
import { Pipeline } from "../Pipeline";
import { GroupType } from "../../../../common/GroupType";
import { ResourceType } from "../../../../common/ResourceType";

export class MaterialResource extends PipelineResourceTemplate {
  binding: number;

  constructor() {
    super(GroupType.Material, ResourceType.Material);
  }

  build<T extends Defines<T>>(renderer: Renderer, pipeline: Pipeline<T>, curBindIndex: number): Template {
    this.binding = curBindIndex;
    const group = pipeline.groupIndex(this.groupType);

    // prettier-ignore
    const initialValues = new Float32Array([
      1, 1, 1, 0,         // Diffuse
      0.0, 0.0, 0.0, 0,   // Emissive
      1,                  // Alpha
      0,                  // Metalness
      0.5                 // Roughness
    ]);

    const SIZE = Mathf.max(Float32Array.BYTES_PER_ELEMENT * initialValues.length, 48); // 48 is the min a size can be in WGPU

    const buffer = renderer.device.createBuffer({
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
        diffuse: vec4<f32>,
        emissive: vec4<f32>,
        opacity: f32,
        metalness: f32,
        roughness: f32
      };

      @group(${group}) @binding(${curBindIndex})
      var<uniform> materialData: MaterialData;
      `,
      vertexBlock: null,
    };
  }

  getBindingData(renderer: Renderer, pipeline: GPURenderPipeline): BindingData {
    // prettier-ignore
    const initialValues = new Float32Array([
      1, 1, 1, 0,         // Diffuse
      0.0, 0.0, 0.0, 0,   // Emissive
      1,                  // Alpha
      0,                  // Metalness
      0.5                 // Roughness
    ]);
    const SIZE = Mathf.max(Float32Array.BYTES_PER_ELEMENT * initialValues.length, 48); // 48 is the min a size can be in WGPU

    const buffer = renderer.device.createBuffer({
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
      binds: [
        {
          binding: this.binding,
          resource,
        },
      ],
      buffer,
    };
  }
}
