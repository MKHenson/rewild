import { Renderer } from '../Renderer';
import precipitationShader from '../shaders/precipitation.wgsl';
import vertexScreenQuadShader from '../shaders/utils/vertexScreenQuad.wgsl';

// PrecipUniforms layout (matches precipitation.wgsl):
//   offset  0: windDirection (vec2)
//   offset  8: windSpeed (f32)
//   offset 12: gustStrength (f32)
//   offset 16: precipitation (f32)
//   offset 20: temperature (f32)
//   offset 24: shelterAmount (f32)
//   offset 28: iTime (f32)
//   offset 32: resolutionX (f32)
//   offset 36: resolutionY (f32)
//   offset 40: _pad (vec2)
// Total: 48 bytes → aligned to 256
const UNIFORM_BYTE_SIZE = 48;
const ALIGNED_UNIFORM_SIZE = Math.ceil(UNIFORM_BYTE_SIZE / 256) * 256;

export interface PrecipitationParams {
  windDirection: { x: number; y: number };
  windSpeed: number;
  gustStrength: number;
  precipitation: number;
  temperature: number;
  shelterAmount: number;
  cameraX: number;
  cameraZ: number;
}

export class PrecipitationPostProcess {
  renderTarget: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;

  private uniformData = new Float32Array(ALIGNED_UNIFORM_SIZE / 4);

  init(renderer: Renderer): void {
    this.dispose();
    const { device, canvas } = renderer;

    this.renderTarget = device.createTexture({
      label: 'precipitation render target',
      size: [canvas.width, canvas.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.uniformBuffer = device.createBuffer({
      label: 'precipitation uniforms',
      size: ALIGNED_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const module = device.createShaderModule({
      label: 'precipitation shader',
      code: precipitationShader,
    });
    const vertexModule = device.createShaderModule({
      label: 'precipitation vertex shader',
      code: vertexScreenQuadShader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'precipitation pipeline',
      layout: 'auto',
      vertex: { module: vertexModule, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
          format: 'rgba8unorm',
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
    });

    this.bindGroup = device.createBindGroup({
      label: 'precipitation bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: renderer.depthTexture.createView() },
      ],
    });
  }

  render(renderer: Renderer, params: PrecipitationParams): void {
    const u = this.uniformData;
    u[0]  = params.windDirection.x;
    u[1]  = params.windDirection.y;
    u[2]  = params.windSpeed;
    u[3]  = params.gustStrength;
    u[4]  = params.precipitation;
    u[5]  = params.temperature;
    u[6]  = params.shelterAmount;
    u[7]  = renderer.totalDeltaTime / 1000; // ms → seconds
    u[8]  = this.renderTarget.width;
    u[9]  = this.renderTarget.height;
    u[10] = params.cameraX;
    u[11] = params.cameraZ;

    renderer.device.queue.writeBuffer(this.uniformBuffer, 0, u.buffer);

    const commandEncoder = renderer.device.createCommandEncoder();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.renderTarget.createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6);
    pass.end();
    renderer.device.queue.submit([commandEncoder.finish()]);
  }

  clear(renderer: Renderer): void {
    const commandEncoder = renderer.device.createCommandEncoder();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.renderTarget.createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.end();
    renderer.device.queue.submit([commandEncoder.finish()]);
  }

  dispose(): void {
    if (this.renderTarget) this.renderTarget.destroy();
    if (this.uniformBuffer) this.uniformBuffer.destroy();
  }
}
