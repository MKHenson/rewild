import { Pane3D } from 'rewild-ui';

const triangleVertWGSL = `
struct OurVertexShaderOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

// Doesnt change much 
struct OurStruct {
  color: vec4f,
  offset: vec2f,
};

// Does change much
struct OtherStruct {
  scale: vec2f,
};

@group(0) @binding(0) var<uniform> ourStruct: OurStruct;
@group(0) @binding(1) var<uniform> otherStruct: OtherStruct;


@vertex
fn vs(
  @builtin(vertex_index) vertexIndex : u32
) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(
    vec2f(0.0, 0.5),
    vec2f(-0.5, -0.5),
    vec2f(0.5, -0.5)
  );

  return vec4f(
    pos[vertexIndex] * otherStruct.scale + ourStruct.offset, 0.0, 1.0);
}
  
@fragment
fn fs() -> @location(0) vec4f {
  return ourStruct.color;
}`;

const sampleCount = 4;

// offsets to the various uniform values in float32 indices
const kColorOffset = 0;
const kOffsetOffset = 4;
const kScaleOffset = 0;

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

  kNumObjects = 100;
  objectInfos: {
    scale: f32;
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
    uniformValues: Float32Array;
  }[] = [];

  private onFrameHandler: () => void;

  constructor() {
    this.onFrameHandler = this.onFrame.bind(this);
  }

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

    const module = device.createShaderModule({
      code: triangleVertWGSL,
    });

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
      },
      fragment: {
        entryPoint: 'fs',
        module,
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

    // A random number between [min and max)
    // With 1 argument it will be [0 to min)
    // With no arguments it will be [0 to 1)
    const rand = (min?: number, max?: number) => {
      if (min === undefined) {
        min = 0;
        max = 1;
      } else if (max === undefined) {
        max = min;
        min = 0;
      }
      return min + Math.random() * (max - min);
    };

    // create 2 buffers for the uniform values
    const staticUniformBufferSize =
      4 * 4 + // color is 4 32bit floats (4bytes each)
      2 * 4 + // offset is 2 32bit floats (4bytes each)
      2 * 4; // padding
    const uniformBufferSize = 2 * 4; // scale is 2 32bit floats (4bytes each)

    for (let i = 0; i < this.kNumObjects; ++i) {
      const staticUniformBuffer = device.createBuffer({
        label: `static uniforms for obj: ${i}`,
        size: staticUniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      // These are only set once so set them now
      {
        const uniformValues = new Float32Array(staticUniformBufferSize / 4);
        uniformValues.set([rand(), rand(), rand(), 1], kColorOffset); // set the color
        uniformValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], kOffsetOffset); // set the offset

        // copy these values to the GPU
        device.queue.writeBuffer(staticUniformBuffer, 0, uniformValues);
      }

      // create a typedarray to hold the values for the uniforms in JavaScript
      const uniformValues = new Float32Array(uniformBufferSize / 4);
      const uniformBuffer = device.createBuffer({
        label: `changing uniforms for obj: ${i}`,
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const bindGroup = device.createBindGroup({
        label: `bind group for obj: ${i}`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: staticUniformBuffer } },
          { binding: 1, resource: { buffer: uniformBuffer } },
        ],
      });

      this.objectInfos.push({
        scale: rand(0.2, 0.5),
        uniformBuffer,
        uniformValues,
        bindGroup,
      });
    }

    requestAnimationFrame(this.onFrameHandler);

    this.initialized = true;
    this.context = context;
    this.device = device;
    this.pipeline = pipeline;
  }

  onFrame() {
    if (this.disposed) return;

    this.render();
    requestAnimationFrame(this.onFrameHandler);
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

      // Set the uniform values in our JavaScript side Float32Array
      const aspect = canvas.width / canvas.height;

      for (const { scale, bindGroup, uniformBuffer, uniformValues } of this
        .objectInfos) {
        uniformValues.set([scale / aspect, scale], kScaleOffset); // set the scale
        device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(3); // call our vertex shader 3 times
      }

      passEncoder.draw(3);
      passEncoder.end();

      device.queue.submit([commandEncoder.finish()]);
    }
  }
}
