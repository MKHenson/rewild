import { Pane3D } from 'rewild-ui';

const triangleVertWGSL = `
@vertex
fn main(
  @builtin(vertex_index) VertexIndex : u32
) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(
    vec2(0.0, 0.5),
    vec2(-0.5, -0.5),
    vec2(0.5, -0.5)
  );

  return vec4f(pos[VertexIndex], 0.0, 1.0);
}`;

const redFragWGSL = `
@fragment
fn main() -> @location(0) vec4f {
  return vec4(1.0, 0.0, 0.0, 1.0);
}
`;

const sampleCount = 4;

export class Renderer {
  device: GPUDevice;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  renderPassDescriptor: GPURenderPassDescriptor;
  canvasToSizeMap: WeakMap<Element, { width: number; height: number }>;
  pane: Pane3D;
  disposed: boolean;
  prevWidth: number;
  prevHeight: number;
  renderTargetView: GPUTextureView | undefined;
  renderTarget: GPUTexture | undefined;
  presentationFormat: GPUTextureFormat;
  initialized: boolean;

  constructor() {}

  async init(pane: Pane3D) {
    if (this.initialized) return;

    this.disposed = false;
    this.initialized = false;
    this.pane = pane;
    this.canvasToSizeMap = new WeakMap();
    const canvas = pane.canvas()!;
    this.prevWidth = canvas.clientWidth;
    this.prevHeight = canvas.clientHeight;

    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) throw new Error('need a browser that supports WebGPU');

    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('need a browser that supports WebGPU');

    device.lost.then((info) => {
      console.error(`WebGPU device was lost: ${info.message}`);

      // 'reason' will be 'destroyed' if we intentionally destroy the device.
      if (info.reason !== 'destroyed') {
      }
    });

    // const devicePixelRatio = 1;
    // canvas.width = canvas.clientWidth * devicePixelRatio;
    // canvas.height = canvas.clientHeight * devicePixelRatio;
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
      device,
      format: this.presentationFormat,
    });

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        entryPoint: 'main',
        module: device.createShaderModule({
          code: triangleVertWGSL,
        }),
      },
      fragment: {
        entryPoint: 'main',
        module: device.createShaderModule({
          code: redFragWGSL,
        }),
        targets: [
          {
            format: this.presentationFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
      multisample: {
        count: sampleCount,
      },
    });

    const frame = () => {
      if (this.disposed) return;

      this.render();
      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);

    this.initialized = true;
    this.context = context;
    this.device = device;
    this.pipeline = pipeline;
  }

  dispose() {
    this.disposed = true;
  }

  async render() {
    const device = this.device;
    const context = this.context;
    const canvas = this.pane.canvas()!;
    const currentWidth = canvas.width;
    const currentHeight = canvas.height;
    let renderTargetView = this.renderTargetView;
    let renderTarget = this.renderTarget;

    // The canvas size is animating via CSS.
    // When the size changes, we need to reallocate the render target.
    // We also need to set the physical size of the canvas to match the computed CSS size.
    if (
      (currentWidth !== this.prevWidth ||
        currentHeight !== this.prevHeight ||
        !renderTargetView) &&
      currentWidth &&
      currentHeight
    ) {
      if (renderTarget !== undefined) {
        // Destroy the previous render target
        renderTarget.destroy();
      }

      // Resize the multisampled render target to match the new canvas size.
      renderTarget = device.createTexture({
        size: [canvas.width, canvas.height],
        sampleCount,
        format: this.presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      renderTargetView = renderTarget.createView();
      this.renderTarget = renderTarget;
      this.renderTargetView = renderTargetView;
      this.prevHeight = currentHeight;
      this.prevWidth = currentWidth;
    }

    if (renderTargetView) {
      const commandEncoder = device.createCommandEncoder();
      const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          {
            view: renderTargetView,
            resolveTarget: context.getCurrentTexture().createView(),
            clearValue: [0.2, 0.2, 0.2, 1.0],
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      };

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(this.pipeline);
      passEncoder.draw(3);
      passEncoder.end();

      device.queue.submit([commandEncoder.finish()]);
    }
  }
}
