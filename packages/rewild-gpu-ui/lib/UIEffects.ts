import shader from './shaders/ui.wgsl';
import rectEffect from './shaders/rect.wgsl';
import plainSurface from './shaders/surface.wgsl';

/** How a pipeline draws: on the screen, in the scene, or in 3D over the scene. */
type PipelineMode = 'screen' | 'world' | 'over';

/**
 * Custom effects. A node effect is a WGSL `effect` function that draws a
 * node's box. A surface effect is a pair of WGSL functions that move and
 * colour a whole surface. Each pair of a node effect and a surface effect
 * gets its own pipeline for each mode, made when it is first drawn. See
 * ui.wgsl for the contracts.
 */
export class UIEffects {
  private sources = new Map<string, string>();
  private surfaceSources = new Map<string, string>();
  private pipelines = new Map<string, GPURenderPipeline>();

  constructor(
    private device: GPUDevice,
    private format: GPUTextureFormat,
    private layout: GPUPipelineLayout,
    private depthFormat: GPUTextureFormat
  ) {}

  register(name: string, wgsl: string): void {
    if (this.sources.has(name))
      throw new Error(`The UI effect "${name}" is already registered`);
    this.sources.set(name, wgsl);
  }

  registerSurface(name: string, wgsl: string): void {
    if (this.surfaceSources.has(name))
      throw new Error(`The UI surface effect "${name}" is already registered`);
    this.surfaceSources.set(name, wgsl);
  }

  /**
   * The pipeline for a node effect, or for a plain rect when `name` is null,
   * on a surface with `surfaceEffect`, or with none when it is null. A world
   * pipeline tests the scene's depth and does not write it, so the boxes of
   * a surface, which lie in one plane, all draw. With `depthTest` false, a
   * world pipeline has no depth, and draws in the screen's pass.
   */
  pipeline(
    name: string | null,
    surfaceEffect: string | null = null,
    world = false,
    depthTest = true
  ): GPURenderPipeline {
    const mode: PipelineMode = !world ? 'screen' : depthTest ? 'world' : 'over';
    const key = `${name ?? ''}|${surfaceEffect ?? ''}|${mode}`;
    let pipeline = this.pipelines.get(key);
    if (pipeline) return pipeline;
    const source = name === null ? rectEffect : this.sources.get(name);
    if (source === undefined)
      throw new Error(`The UI effect "${name}" is not registered`);
    const surfaceSource =
      surfaceEffect === null
        ? plainSurface
        : this.surfaceSources.get(surfaceEffect);
    if (surfaceSource === undefined)
      throw new Error(
        `The UI surface effect "${surfaceEffect}" is not registered`
      );
    const label = [
      name === null ? 'ui' : `ui-${name}`,
      surfaceEffect,
      mode === 'screen' ? null : mode,
    ]
      .filter(Boolean)
      .join('-');
    const module = this.device.createShaderModule({
      label,
      code: `${shader}\n${source}\n${surfaceSource}`,
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
      // A world surface's front faces the camera with its corners clockwise,
      // as its y points down.
      primitive: { topology: 'triangle-strip', frontFace: 'cw' },
      depthStencil:
        mode === 'world'
          ? {
              format: this.depthFormat,
              depthWriteEnabled: false,
              depthCompare: 'less-equal',
            }
          : undefined,
    });
    this.pipelines.set(key, pipeline);
    return pipeline;
  }
}
