import shader from './shaders/ui.wgsl';
import rectEffect from './shaders/rect.wgsl';

/**
 * Custom effects: WGSL `effect` functions that draw a node's box. Each
 * effect gets its own pipeline, made when a node first uses it. See ui.wgsl
 * for the contract.
 */
export class UIEffects {
  private sources = new Map<string, string>();
  private pipelines = new Map<string | null, GPURenderPipeline>();

  constructor(
    private device: GPUDevice,
    private format: GPUTextureFormat,
    private layout: GPUPipelineLayout
  ) {}

  register(name: string, wgsl: string): void {
    if (this.sources.has(name))
      throw new Error(`The UI effect "${name}" is already registered`);
    this.sources.set(name, wgsl);
  }

  /** The pipeline for an effect, or for a plain rect when `name` is null. */
  pipeline(name: string | null): GPURenderPipeline {
    let pipeline = this.pipelines.get(name);
    if (pipeline) return pipeline;
    const source = name === null ? rectEffect : this.sources.get(name);
    if (source === undefined)
      throw new Error(`The UI effect "${name}" is not registered`);
    const label = name === null ? 'ui' : `ui-${name}`;
    const module = this.device.createShaderModule({
      label,
      code: `${shader}\n${source}`,
    });
    const blend: GPUBlendComponent = {
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
    };
    pipeline = this.device.createRenderPipeline({
      label,
      layout: this.layout,
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          { format: this.format, blend: { color: blend, alpha: blend } },
        ],
      },
      primitive: { topology: 'triangle-strip' },
    });
    this.pipelines.set(name, pipeline);
    return pipeline;
  }
}
