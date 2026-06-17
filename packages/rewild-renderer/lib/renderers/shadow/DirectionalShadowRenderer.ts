import { Matrix4, Vector3 } from 'rewild-common';
import { Renderer } from '../../Renderer';
import { PerspectiveCamera } from '../../core/PerspectiveCamera';
import { IRenderGroup } from '../../../types/IRenderGroup';
import { IVisualComponent } from '../../../types/interfaces';
import shader from '../../shaders/shadow-depth.wgsl';

export const SHADOW_MAP_SIZE = 2048;

// XY half-size (world units) for the shadow ortho frustum.
// Capping this prevents the shadow map covering the full camera far distance (~2000 units),
// which would leave only ~1 texel per world unit. At 300 units: 600/2048 ≈ 0.29 units/texel.
const SHADOW_HALF_SIZE = 100;

// NDC corners used to reconstruct view frustum in world space.
// The camera projection matrix uses OpenGL convention (near → -1, far → +1).
const NDC_NEAR_Z = -1;
const NDC_FAR_Z = 1;
const NDC_CORNERS: [number, number, number][] = [
  [-1, -1, NDC_NEAR_Z],
  [1, -1, NDC_NEAR_Z],
  [1, 1, NDC_NEAR_Z],
  [-1, 1, NDC_NEAR_Z],
  [-1, -1, NDC_FAR_Z],
  [1, -1, NDC_FAR_Z],
  [1, 1, NDC_FAR_Z],
  [-1, 1, NDC_FAR_Z],
];

interface MeshShadowUniforms {
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
}

export class DirectionalShadowRenderer {
  shadowDepthTexture: GPUTexture;
  /** Light view-projection matrix — updated each frame, read by DirectionalShadow uniform. */
  lightVP: Matrix4;

  private pipeline: GPURenderPipeline;
  private meshUniforms: Map<IVisualComponent, MeshShadowUniforms>;

  // Pre-allocated per-frame math objects — never allocated inside render().
  private _lightViewWorld: Matrix4;
  private _lightView: Matrix4;
  private _lightProj: Matrix4;
  private _shadowMVP: Matrix4;
  private _frustumCorners: Vector3[];
  private _lightPos: Vector3;
  private _frustumCenter: Vector3;
  private _lightDir: Vector3;
  private _lightUp: Vector3;
  private _matData: Float32Array;

  constructor() {
    this.lightVP = new Matrix4();
    this.meshUniforms = new Map();
    this._lightViewWorld = new Matrix4();
    this._lightView = new Matrix4();
    this._lightProj = new Matrix4();
    this._shadowMVP = new Matrix4();
    this._frustumCorners = Array.from({ length: 8 }, () => new Vector3());
    this._lightPos = new Vector3();
    this._frustumCenter = new Vector3();
    this._lightDir = new Vector3();
    this._lightUp = new Vector3();
    this._matData = new Float32Array(16);
  }

  init(renderer: Renderer): void {
    const { device } = renderer;

    this.shadowDepthTexture = device.createTexture({
      label: 'directional shadow depth',
      size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, 1],
      format: 'depth32float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const module = device.createShaderModule({
      label: 'shadow depth shader',
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'directional shadow pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 4 * 3,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
        ],
      },
      // Depth-only — no fragment stage needed.
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
        frontFace: 'ccw',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth32float',
      },
    });
  }

  render(
    encoder: GPUCommandEncoder,
    renderList: IRenderGroup[],
    camera: PerspectiveCamera,
    renderer: Renderer
  ): void {
    const sun = renderer.sky?.skyRenderer?.sun;
    if (!sun) return;

    this._computeLightVP(camera, sun.transform.position);

    const { device } = renderer;

    // Ensure per-mesh uniform buffers exist and draw (geometry must already be built).
    for (const item of renderList) {
      if (item.geometry.requiresBuild) continue;
      for (const mesh of item.meshes) {
        this._ensureMeshUniforms(device, mesh);
      }
    }

    const depthView = this.shadowDepthTexture.createView();
    const pass = encoder.beginRenderPass({
      label: 'directional shadow pass',
      colorAttachments: [],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    pass.setPipeline(this.pipeline);

    for (const item of renderList) {
      if (item.geometry.requiresBuild) continue;

      const geo = item.geometry;
      pass.setVertexBuffer(0, geo.vertexBuffer);
      pass.setIndexBuffer(geo.indexBuffer, 'uint32');
      const numIndices = geo.indices!.length;

      for (const mesh of item.meshes) {
        const uniforms = this.meshUniforms.get(mesh);
        if (!uniforms) continue;

        // Compute per-mesh shadow MVP: lightVP * mesh world matrix
        this._shadowMVP.multiplyMatrices(
          this.lightVP,
          mesh.transform.matrixWorld
        );
        this._matData.set(this._shadowMVP.elements);
        device.queue.writeBuffer(uniforms.buffer, 0, this._matData.buffer);

        pass.setBindGroup(0, uniforms.bindGroup);
        pass.drawIndexed(numIndices);
      }
    }

    pass.end();
  }

  dispose(): void {
    this.shadowDepthTexture?.destroy();
    for (const { buffer } of this.meshUniforms.values()) {
      buffer.destroy();
    }
    this.meshUniforms.clear();
  }

  private _ensureMeshUniforms(device: GPUDevice, mesh: IVisualComponent): void {
    if (this.meshUniforms.has(mesh)) return;

    const buffer = device.createBuffer({
      label: 'shadow mesh MVP',
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      label: 'shadow mesh bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer } }],
    });

    this.meshUniforms.set(mesh, { buffer, bindGroup });
  }

  private _computeLightVP(
    camera: PerspectiveCamera,
    sunPosition: Vector3
  ): void {
    // --- Frustum corners in world space ---
    const camCamera = camera.camera;
    const projInv = camCamera.projectionMatrixInverse;
    const camWorld = camCamera.transform.matrixWorld;
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;

    // Compute frustum center for positioning the light
    this._frustumCenter.set(0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const [nx, ny, nz] = NDC_CORNERS[i];
      this._frustumCorners[i].set(nx, ny, nz).unproject(projInv, camWorld);
      this._frustumCenter.x += this._frustumCorners[i].x;
      this._frustumCenter.y += this._frustumCorners[i].y;
      this._frustumCenter.z += this._frustumCorners[i].z;
    }
    this._frustumCenter.x /= 8;
    this._frustumCenter.y /= 8;
    this._frustumCenter.z /= 8;

    // --- Light view matrix (rotation only, then positioned behind the scene) ---
    const sunLen = Math.sqrt(
      sunPosition.x * sunPosition.x +
        sunPosition.y * sunPosition.y +
        sunPosition.z * sunPosition.z
    );
    if (sunLen < 0.0001) return;
    this._lightDir.set(
      sunPosition.x / sunLen,
      sunPosition.y / sunLen,
      sunPosition.z / sunLen
    );

    // Choose a stable up vector — if sun is nearly vertical use world X
    if (Math.abs(this._lightDir.y) > 0.99) {
      this._lightUp.set(1, 0, 0);
    } else {
      this._lightUp.set(0, 1, 0);
    }

    // Light eye = frustum center + lightDir * large distance
    const orbitDist = 2000;
    this._lightPos.set(
      this._frustumCenter.x + this._lightDir.x * orbitDist,
      this._frustumCenter.y + this._lightDir.y * orbitDist,
      this._frustumCenter.z + this._lightDir.z * orbitDist
    );

    // Build light world matrix: lookAt gives rotation, setPosition adds translation
    this._lightViewWorld.lookAt(
      this._lightPos,
      this._frustumCenter,
      this._lightUp
    );
    this._lightViewWorld.setPosition(
      this._lightPos.x,
      this._lightPos.y,
      this._lightPos.z
    );

    // Light view = inverse of its world matrix
    this._lightView.copy(this._lightViewWorld).invert();

    // --- Fit ortho bounds to frustum corners in light space ---
    for (let i = 0; i < 8; i++) {
      const w = this._frustumCorners[i];
      // applyMatrix4 modifies in place — use a temporary copy via the corner itself
      const lx =
        this._lightView.elements[0] * w.x +
        this._lightView.elements[4] * w.y +
        this._lightView.elements[8] * w.z +
        this._lightView.elements[12];
      const ly =
        this._lightView.elements[1] * w.x +
        this._lightView.elements[5] * w.y +
        this._lightView.elements[9] * w.z +
        this._lightView.elements[13];
      const lz =
        this._lightView.elements[2] * w.x +
        this._lightView.elements[6] * w.y +
        this._lightView.elements[10] * w.z +
        this._lightView.elements[14];

      if (lx < minX) minX = lx;
      if (lx > maxX) maxX = lx;
      if (ly < minY) minY = ly;
      if (ly > maxY) maxY = ly;
      if (lz < minZ) minZ = lz;
      if (lz > maxZ) maxZ = lz;
    }

    // Center the shadow XY on the camera position (not the frustum centroid).
    // This keeps the high-resolution area near the player regardless of far-plane distance.
    const camPos = camCamera.transform.position;
    const lve = this._lightView.elements;
    const lcx =
      lve[0] * camPos.x + lve[4] * camPos.y + lve[8] * camPos.z + lve[12];
    const lcy =
      lve[1] * camPos.x + lve[5] * camPos.y + lve[9] * camPos.z + lve[13];
    minX = lcx - SHADOW_HALF_SIZE;
    maxX = lcx + SHADOW_HALF_SIZE;
    minY = lcy - SHADOW_HALF_SIZE;
    maxY = lcy + SHADOW_HALF_SIZE;

    // Extend Z so casters just behind/ahead of the frustum still cast shadows.
    minZ -= 50;
    maxZ += 50;

    // Light-space Z is negative (geometry is in front of the -Z looking camera).
    // _makeOrthoWebGPU expects positive near/far distances, so negate.
    const nearDist = Math.max(0.1, -maxZ);
    const farDist = Math.max(nearDist + 1, -minZ);

    // --- WebGPU-correct orthographic projection ---
    // Maps near→Z=0, far→Z=1 (WebGPU depth convention)
    this._makeOrthoWebGPU(minX, maxX, maxY, minY, nearDist, farDist);

    // lightVP = lightProj * lightView
    this.lightVP.multiplyMatrices(this._lightProj, this._lightView);
  }

  /** Orthographic projection matrix using WebGPU depth convention [0, 1]. */
  private _makeOrthoWebGPU(
    left: number,
    right: number,
    top: number,
    bottom: number,
    near: number,
    far: number
  ): void {
    const w = 1 / (right - left);
    const h = 1 / (top - bottom);
    const p = 1 / (far - near);
    const te = this._lightProj.elements;

    te[0] = 2 * w;
    te[4] = 0;
    te[8] = 0;
    te[12] = -(right + left) * w;
    te[1] = 0;
    te[5] = 2 * h;
    te[9] = 0;
    te[13] = -(top + bottom) * h;
    te[2] = 0;
    te[6] = 0;
    te[10] = -p;
    te[14] = -near * p;
    te[3] = 0;
    te[7] = 0;
    te[11] = 0;
    te[15] = 1;
  }
}
