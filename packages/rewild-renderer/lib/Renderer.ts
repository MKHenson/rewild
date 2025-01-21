import { Pane3D } from 'rewild-ui';
import simpleShader from './shaders/simple.wgsl';

const kNumObjects = 100;
const sampleCount = 4;

// offsets to the various uniform values in float32 indices
const kColorOffset = 0;
const kOffsetOffset = 4;
const kScaleOffset = 0;
// create 2 storage buffers
const staticUnitSize =
  4 * 4 + // color is 4 32bit floats (4bytes each)
  2 * 4; // offset is 2 32bit floats (4bytes each)

const changingUnitSize = 2 * 4; // scale is 2 32bit floats (4bytes each)

const staticVertexBufferSize = staticUnitSize * kNumObjects;
const changingVertexBufferSize = changingUnitSize * kNumObjects;

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

function createCircleVertices({
  radius = 1,
  numSubdivisions = 24,
  innerRadius = 0,
  startAngle = 0,
  endAngle = Math.PI * 2,
} = {}) {
  // 2 triangles per subdivision, 3 verts per tri, 5 values (xyrgb) each.
  const numVertices = numSubdivisions * 3 * 2;
  const vertexData = new Float32Array(numVertices * (2 + 3));

  let offset = 0;
  const addVertex = (x: number, y: number, r: number, g: number, b: number) => {
    vertexData[offset++] = x;
    vertexData[offset++] = y;
    vertexData[offset++] = r;
    vertexData[offset++] = g;
    vertexData[offset++] = b;
  };

  const innerColor = [1, 1, 1];
  const outerColor = [0.1, 0.1, 0.1];

  // 2 triangles per subdivision
  //
  // 0--1 4
  // | / /|
  // |/ / |
  // 2 3--5
  for (let i = 0; i < numSubdivisions; ++i) {
    const angle1 =
      startAngle + ((i + 0) * (endAngle - startAngle)) / numSubdivisions;
    const angle2 =
      startAngle + ((i + 1) * (endAngle - startAngle)) / numSubdivisions;

    const c1 = Math.cos(angle1);
    const s1 = Math.sin(angle1);
    const c2 = Math.cos(angle2);
    const s2 = Math.sin(angle2);

    // first triangle
    addVertex(
      c1 * radius,
      s1 * radius,
      outerColor[0],
      outerColor[1],
      outerColor[2]
    );
    addVertex(
      c2 * radius,
      s2 * radius,
      outerColor[0],
      outerColor[1],
      outerColor[2]
    );
    addVertex(
      c1 * innerRadius,
      s1 * innerRadius,
      innerColor[0],
      innerColor[1],
      innerColor[2]
    );

    // second triangle
    addVertex(
      c1 * innerRadius,
      s1 * innerRadius,
      innerColor[0],
      innerColor[1],
      innerColor[2]
    );
    addVertex(
      c2 * radius,
      s2 * radius,
      outerColor[0],
      outerColor[1],
      outerColor[2]
    );
    addVertex(
      c2 * innerRadius,
      s2 * innerRadius,
      innerColor[0],
      innerColor[1],
      innerColor[2]
    );
  }

  return {
    vertexData,
    numVertices,
  };
}

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
  bindGroup: GPUBindGroup;
  numVertices: number;
  vertexBuffer: GPUBuffer;
  staticVertexBuffer: GPUBuffer;
  changingVertexBuffer: GPUBuffer;
  vertexValues: Float32Array;

  objectInfos: {
    scale: number;
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
      code: simpleShader,
    });

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 5 * 4, // 5 floats, 4 bytes each
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
              { shaderLocation: 4, offset: 8, format: 'float32x3' }, // perVertexColor
            ],
          },
          {
            arrayStride: 6 * 4, // 6 floats, 4 bytes each
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x4' }, // color
              { shaderLocation: 2, offset: 16, format: 'float32x2' }, // offset
            ],
          },
          {
            arrayStride: 2 * 4, // 2 floats, 4 bytes each
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 3, offset: 0, format: 'float32x2' }, // scale
            ],
          },
        ],
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

    // a typed array we can use to update the changingStorageBuffer
    const vertexValues = new Float32Array(changingVertexBufferSize / 4);

    // setup a storage buffer with vertex data
    const { vertexData, numVertices } = createCircleVertices({
      radius: 0.5,
      innerRadius: 0.25,
    });

    const vertexBuffer = device.createBuffer({
      label: 'vertex buffer vertices',
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);

    const staticVertexBuffer = device.createBuffer({
      label: 'static vertex for objects',
      size: staticVertexBufferSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const changingVertexBuffer = device.createBuffer({
      label: 'changing vertex for objects',
      size: changingVertexBufferSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.numVertices = numVertices;

    {
      const staticVertexValues = new Float32Array(staticVertexBufferSize / 4);
      for (let i = 0; i < kNumObjects; ++i) {
        const staticOffset = i * (staticUnitSize / 4);

        // These are only set once so set them now
        staticVertexValues.set(
          [rand(), rand(), rand(), 1],
          staticOffset + kColorOffset
        ); // set the color
        staticVertexValues.set(
          [rand(-0.9, 0.9), rand(-0.9, 0.9)],
          staticOffset + kOffsetOffset
        ); // set the offset

        this.objectInfos.push({
          scale: rand(0.2, 0.5),
        });
      }
      device.queue.writeBuffer(staticVertexBuffer, 0, staticVertexValues);
    }

    this.vertexValues = vertexValues;
    this.initialized = true;
    this.context = context;
    this.device = device;
    this.pipeline = pipeline;
    this.vertexBuffer = vertexBuffer;
    this.staticVertexBuffer = staticVertexBuffer;
    this.changingVertexBuffer = changingVertexBuffer;

    requestAnimationFrame(this.onFrameHandler);
  }

  onFrame() {
    if (this.disposed) return;

    this.render();
    requestAnimationFrame(this.onFrameHandler);
  }

  dispose() {
    this.disposed = true;
  }

  prepareRender() {
    const device = this.device;
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
  }

  async render() {
    this.prepareRender();
    const device = this.device;
    const context = this.context;
    const canvas = this.pane.canvas()!;
    let renderTargetView = this.renderTargetView;

    if (renderTargetView) {
      const encoder = device.createCommandEncoder();
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

      const pass = encoder.beginRenderPass(renderPassDescriptor);
      pass.setPipeline(this.pipeline);
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.setVertexBuffer(1, this.staticVertexBuffer);
      pass.setVertexBuffer(2, this.changingVertexBuffer);

      // Set the uniform values in our JavaScript side Float32Array
      const aspect = canvas.width / canvas.height;

      // set the scales for each object
      this.objectInfos.forEach(({ scale }, ndx) => {
        const offset = ndx * (changingUnitSize / 4);
        this.vertexValues.set([scale / aspect, scale], offset + kScaleOffset); // set the scale
      });
      // upload all scales at once
      device.queue.writeBuffer(this.changingVertexBuffer, 0, this.vertexValues);

      pass.setBindGroup(0, this.bindGroup);
      pass.draw(this.numVertices, kNumObjects); // ca

      pass.end();

      const commandBuffer = encoder.finish();
      device.queue.submit([commandBuffer]);
    }
  }
}
