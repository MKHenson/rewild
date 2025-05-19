import { IRenderable } from '../../types/interfaces';
import { Renderer } from '../Renderer';
import simpleShader from '../shaders/circles.wgsl';

export class CirclesRenderer implements IRenderable {
  bindGroup: GPUBindGroup;
  numVertices: number;
  vertexBuffer: GPUBuffer;
  staticVertexBuffer: GPUBuffer;
  changingVertexBuffer: GPUBuffer;
  vertexValues: Float32Array;
  pipeline: GPURenderPipeline;
  objectInfos: {
    scale: number;
  }[] = [];

  async initialize(renderer: Renderer) {
    const { device, presentationFormat } = renderer;

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
            format: presentationFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
      multisample: {
        count: renderer.sampleCount,
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less',
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
    this.pipeline = pipeline;
    this.vertexBuffer = vertexBuffer;
    this.staticVertexBuffer = staticVertexBuffer;
    this.changingVertexBuffer = changingVertexBuffer;
    return this;
  }

  update(): void {}

  render(renderer: Renderer, pass: GPURenderPassEncoder) {
    const { device, canvas } = renderer;

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
  }
}

const kNumObjects = 100;

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
