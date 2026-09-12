import { Vector3 } from 'rewild-common';
import { Renderer } from '../..';
import { Geometry } from '../../geometry/Geometry';
import bakeShader from '../../shaders/scatter-impostor-bake.wgsl';
import { ScatterImpostor, ScatterLayer } from './ScatterLayers';
import { ScatterPrimitive } from './ScatterModels';

// viewProj + nodeMatrix + baseColorFactor + params + viewDir, padded to the
// uniform offset alignment so every (view, primitive) gets its own slot.
const BAKE_UNIFORM_BYTES = 64 * 2 + 16 * 3;
const BAKE_UNIFORM_STRIDE = 256;

/** ImpostorParams in shader-lib/scatter-impostor.wgsl. */
const IMPOSTOR_PARAMS_BYTES = 32;

/** Bake resolution over the tile's, per axis. A power of two, so the mip chain
 *  lands exactly on the tile size. */
const SUPERSAMPLE = 4;

/** Coverage below which an impostor texel is discarded at draw. The atlas
 *  carries fractional coverage, so this is where a soft edge is cut. */
const IMPOSTOR_CUTOFF = 0.4;

/**
 * What a bake produces and the impostor passes draw from: the two atlases,
 * the params block both shaders read them through, and the billboard's reach
 * for the chunk-level bounds.
 */
export interface ScatterImpostorAtlas {
  albedo: GPUTexture;
  normal: GPUTexture;
  params: GPUBuffer;
  sampler: GPUSampler;
  /** Model-space centre of the bounding sphere the billboard stands on. */
  centre: Vector3;
  /** Radius of that sphere: half the billboard's edge at scale 1. */
  radius: number;
  /** Furthest any point of the billboard reaches from the instance origin. */
  reach: number;
}

/**
 * Hemi-octahedral decode: a point on the unit square back to the upper
 * hemisphere direction it stands for. The pole is the centre of the square
 * and the horizon runs round its edge. Inverse of impostorOctUv in the shader.
 */
export function hemiOctDecode(u: number, v: number, out: Vector3): Vector3 {
  const a = u * 2 - 1;
  const b = v * 2 - 1;
  const x = (a + b) * 0.5;
  const z = (a - b) * 0.5;
  const y = 1 - Math.abs(x) - Math.abs(z);
  return out.set(x, y, z).normalize();
}

/**
 * The billboard frame for a view direction: right and up, right-handed with
 * the direction. Must match impostorRight / impostorUp in the shader exactly,
 * since the draw frames its quad by the same rule the bake framed its camera.
 */
export function billboardFrame(
  dir: Vector3,
  right: Vector3,
  up: Vector3
): void {
  if (Math.abs(dir.y) > 0.999) up.set(0, 0, 1);
  else up.set(0, 1, 0);
  right.crossVectors(up, dir).normalize();
  up.crossVectors(dir, right);
}

/**
 * Bakes a layer's model into an octahedral atlas: `views²` orthographic
 * captures of the model, one per direction on the upper hemisphere, tiled
 * into one texture for base colour and one for the model-space normal.
 *
 * Runs on the GPU at the layer's first use, once per layer. The pipeline is
 * shared; the atlases are the layer's own.
 */
export class ScatterImpostorBaker {
  private pipeline: GPURenderPipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private quad: Geometry | null = null;

  /** The unit billboard every impostor draws: a quad on z = 0 spanning ±1,
   *  with v running down so a tile's top is the quad's top. */
  billboard(): Geometry {
    if (this.quad) return this.quad;
    const quad = new Geometry();
    quad.vertices = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    quad.uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
    quad.normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    quad.indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    quad.autoComputeBVH = false;
    this.quad = quad;
    return quad;
  }

  bake(
    renderer: Renderer,
    layer: ScatterLayer,
    impostor: ScatterImpostor,
    primitives: ScatterPrimitive[]
  ): ScatterImpostorAtlas {
    const { device } = renderer;
    this.ensurePipeline(renderer);

    const { centre, radius } = boundingSphere(primitives);
    const { views, tileSize } = impostor;
    const size = views * tileSize;
    const mipLevelCount = Math.floor(Math.log2(size)) + 1;

    // Level 0 is copied in; the rest are rendered by the mip generator.
    const atlasUsage =
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT;
    const albedo = device.createTexture({
      label: `${layer.name} impostor albedo`,
      size: [size, size],
      format: 'rgba8unorm-srgb',
      mipLevelCount,
      usage: atlasUsage,
    });
    const normal = device.createTexture({
      label: `${layer.name} impostor normal`,
      size: [size, size],
      format: 'rgba8unorm',
      mipLevelCount,
      usage: atlasUsage,
    });

    // One row of tiles at a time, at SUPERSAMPLE times the tile size, then
    // box-filtered down through the mip chain into the atlas. A tile rendered
    // at its final size would sample the leaf texture so far down its mips that
    // most cards fail the cutoff before they reach the atlas; oversampling
    // keeps them, and the filter turns the cutout into fractional coverage.
    const rowUsage =
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC;
    const rowSize: [number, number] = [
      size * SUPERSAMPLE,
      tileSize * SUPERSAMPLE,
    ];
    const rowMips = Math.log2(SUPERSAMPLE) + 1;
    const rowAlbedo = device.createTexture({
      label: `${layer.name} impostor bake row albedo`,
      size: rowSize,
      format: 'rgba8unorm-srgb',
      mipLevelCount: rowMips,
      usage: rowUsage,
    });
    const rowNormal = device.createTexture({
      label: `${layer.name} impostor bake row normal`,
      size: rowSize,
      format: 'rgba8unorm',
      mipLevelCount: rowMips,
      usage: rowUsage,
    });
    const depth = device.createTexture({
      label: `${layer.name} impostor bake depth`,
      size: rowSize,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const uniforms = this.writeViewUniforms(
      renderer,
      primitives,
      centre,
      radius,
      views
    );
    const bindGroups = primitives.map((primitive) =>
      device.createBindGroup({
        label: `${layer.name} impostor bake`,
        layout: this.bindGroupLayout!,
        entries: [
          {
            binding: 0,
            resource: { buffer: uniforms, size: BAKE_UNIFORM_BYTES },
          },
          {
            binding: 1,
            resource:
              primitive.pass.material.sampler ||
              renderer.samplerManager.get('linear'),
          },
          {
            binding: 2,
            // The material binds its own defaults at build, which may not
            // have happened yet for a layer baked before its first draw.
            resource: (
              primitive.pass.material.baseColorTexture ||
              renderer.textureManager.get('white-1x1').gpuTexture
            ).createView(),
          },
          {
            binding: 3,
            resource: (
              primitive.pass.material.occlusionTexture ||
              renderer.textureManager.get('white-1x1').gpuTexture
            ).createView(),
          },
        ],
      })
    );

    const level0 = { baseMipLevel: 0, mipLevelCount: 1 };
    for (let row = 0; row < views; row++) {
      const encoder = device.createCommandEncoder({
        label: `${layer.name} impostor bake row ${row}`,
      });
      const pass = encoder.beginRenderPass({
        label: `${layer.name} impostor bake row ${row}`,
        colorAttachments: [
          {
            view: rowAlbedo.createView(level0),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
          {
            view: rowNormal.createView(level0),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: depth.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'discard',
        },
      });

      pass.setPipeline(this.pipeline!);
      for (let column = 0; column < views; column++) {
        const view = row * views + column;
        pass.setViewport(
          column * tileSize * SUPERSAMPLE,
          0,
          tileSize * SUPERSAMPLE,
          tileSize * SUPERSAMPLE,
          0,
          1
        );

        for (let p = 0; p < primitives.length; p++) {
          const { geometry } = primitives[p];
          pass.setBindGroup(0, bindGroups[p], [
            (view * primitives.length + p) * BAKE_UNIFORM_STRIDE,
          ]);
          pass.setVertexBuffer(0, geometry.vertexBuffer);
          pass.setVertexBuffer(1, geometry.uvBuffer);
          pass.setVertexBuffer(2, geometry.normalBuffer);
          pass.setIndexBuffer(geometry.indexBuffer, 'uint32');
          pass.drawIndexed(geometry.indices!.length);
        }
      }
      pass.end();
      device.queue.submit([encoder.finish()]);

      renderer.mipmapGenerator.generateMips(device, rowAlbedo);
      renderer.mipmapGenerator.generateMips(device, rowNormal);

      const copy = device.createCommandEncoder({
        label: `${layer.name} impostor bake row ${row} copy`,
      });
      for (const [from, to] of [
        [rowAlbedo, albedo],
        [rowNormal, normal],
      ] as const)
        copy.copyTextureToTexture(
          { texture: from, mipLevel: rowMips - 1 },
          { texture: to, mipLevel: 0, origin: [0, row * tileSize] },
          [size, tileSize]
        );
      device.queue.submit([copy.finish()]);
    }

    renderer.mipmapGenerator.generateMips(device, albedo);
    renderer.mipmapGenerator.generateMips(device, normal);
    rowAlbedo.destroy();
    rowNormal.destroy();
    depth.destroy();
    uniforms.destroy();

    const params = device.createBuffer({
      label: `${layer.name} impostor params`,
      size: IMPOSTOR_PARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      params,
      0,
      new Float32Array([
        centre.x,
        centre.y,
        centre.z,
        radius,
        views,
        IMPOSTOR_CUTOFF,
        0,
        0,
      ])
    );

    return {
      albedo,
      normal,
      params,
      sampler: renderer.samplerManager.get('linear-clamped'),
      centre,
      radius,
      reach: centre.length() + radius,
    };
  }

  dispose(): void {
    this.quad?.dispose();
    this.quad = null;
  }

  private ensurePipeline(renderer: Renderer): void {
    if (this.pipeline) return;
    const { device } = renderer;

    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'impostor bake',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
      ],
    });

    const module = device.createShaderModule({
      label: 'impostor bake shader',
      code: bakeShader,
    });

    const vec3 = (shaderLocation: number): GPUVertexBufferLayout => ({
      arrayStride: 12,
      attributes: [{ shaderLocation, offset: 0, format: 'float32x3' }],
    });

    this.pipeline = device.createRenderPipeline({
      label: 'impostor bake',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          vec3(0),
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
          },
          vec3(2),
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: 'rgba8unorm-srgb' }, { format: 'rgba8unorm' }],
      },
      // Both faces: the leaves are double sided, and a trunk's back faces
      // lose the depth test anyway.
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });
  }

  /**
   * One uniform slot per (view, primitive): the orthographic clip transform
   * that looks at the sphere from the tile's direction, plus what the
   * fragment needs to cut out and orient the primitive's surface.
   */
  private writeViewUniforms(
    renderer: Renderer,
    primitives: ScatterPrimitive[],
    centre: Vector3,
    radius: number,
    views: number
  ): GPUBuffer {
    const { device } = renderer;
    const slots = views * views * primitives.length;
    const data = new Float32Array((slots * BAKE_UNIFORM_STRIDE) / 4);
    const dir = new Vector3();
    const right = new Vector3();
    const up = new Vector3();

    for (let view = 0; view < views * views; view++) {
      const column = view % views;
      const row = Math.floor(view / views);
      hemiOctDecode(column / (views - 1), row / (views - 1), dir);
      billboardFrame(dir, right, up);

      for (let p = 0; p < primitives.length; p++) {
        const base = ((view * primitives.length + p) * BAKE_UNIFORM_STRIDE) / 4;
        writeOrthographic(data, base, centre, radius, dir, right, up);
        data.set(primitives[p].nodeMatrix, base + 16);

        const { material, alphaMode, authoredNormals } = primitives[p].pass;
        data.set(material.baseColorFactor, base + 32);
        data[base + 36] = material.alphaCutoff;
        data[base + 37] = alphaMode === 'MASK' ? 1 : 0;
        data[base + 38] = authoredNormals ? 1 : 0;
        data[base + 39] = material.occlusionStrength;
        data[base + 40] = dir.x;
        data[base + 41] = dir.y;
        data[base + 42] = dir.z;
      }
    }

    const buffer = device.createBuffer({
      label: 'impostor bake uniforms',
      size: data.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }
}

/**
 * Column-major clip transform for an orthographic camera at `centre + dir *
 * 2r` looking back at the sphere: x and y span the sphere's diameter, depth
 * runs 0..1 over 4r so the whole sphere sits inside it. Clip +y is the frame's
 * up, which puts the top of the model at the top of the tile.
 */
function writeOrthographic(
  out: Float32Array,
  base: number,
  centre: Vector3,
  radius: number,
  dir: Vector3,
  right: Vector3,
  up: Vector3
): void {
  const r = radius;
  const setRow = (row: number, x: number, y: number, z: number, w: number) => {
    out[base + row] = x;
    out[base + 4 + row] = y;
    out[base + 8 + row] = z;
    out[base + 12 + row] = w;
  };
  setRow(0, right.x / r, right.y / r, right.z / r, -centre.dot(right) / r);
  setRow(1, up.x / r, up.y / r, up.z / r, -centre.dot(up) / r);
  setRow(
    2,
    -dir.x / (4 * r),
    -dir.y / (4 * r),
    -dir.z / (4 * r),
    (2 * r + centre.dot(dir)) / (4 * r)
  );
  setRow(3, 0, 0, 0, 1);
}

/** The sphere about every primitive's transformed bounding box. */
function boundingSphere(primitives: ScatterPrimitive[]): {
  centre: Vector3;
  radius: number;
} {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const corner = new Vector3();

  const corners = (
    primitive: ScatterPrimitive,
    visit: (c: Vector3) => void
  ) => {
    const { geometry, nodeMatrix } = primitive;
    if (geometry.boundingBox === null) geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    for (let i = 0; i < 8; i++) {
      corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      );
      applyColumnMajor(corner, nodeMatrix);
      visit(corner);
    }
  };

  for (const primitive of primitives)
    corners(primitive, (c) => {
      min.min(c);
      max.max(c);
    });

  const centre = new Vector3().addVectors(min, max).multiplyScalar(0.5);
  let radius = 0;
  for (const primitive of primitives)
    corners(primitive, (c) => {
      radius = Math.max(radius, c.distanceTo(centre));
    });

  return { centre, radius };
}

function applyColumnMajor(v: Vector3, m: Float32Array): void {
  const { x, y, z } = v;
  v.set(
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  );
}
