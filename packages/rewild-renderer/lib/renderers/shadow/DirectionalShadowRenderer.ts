import { Matrix4, Vector3 } from 'rewild-common';
import { Renderer } from '../../Renderer';
import { PerspectiveCamera } from '../../core/PerspectiveCamera';
import { IRenderGroup } from '../../../types/IRenderGroup';
import { IVisualComponent } from '../../../types/interfaces';
import shader from '../../shaders/shadow-depth.wgsl';
import { ShadowDebugRenderer } from './ShadowDebugRenderer';

export const SHADOW_MAP_SIZE = 2048;
export const NUM_CASCADES = 3;

// Each cascade occupies one 1024×1024 quadrant of the 2048×2048 atlas.
const CASCADE_SIZE = SHADOW_MAP_SIZE / 2;

// Maximum view-space distance (world units) that receives shadows.
// Keeps the far cascade resolution acceptable despite the camera's 2000-unit far plane.
const SHADOW_CASCADE_FAR = 500;

// Practical-split blend factor λ: 0 = uniform spacing, 1 = logarithmic spacing.
// Higher values pull cascade 0 much tighter (better near-shadow texel density).
const CSM_LAMBDA = 0.85;

// Atlas pixel offset [x, y] for each cascade.
// Layout: cascade 0 = top-left, cascade 1 = top-right, cascade 2 = bottom-left.
// Bottom-right quadrant (1024, 1024) is reserved for the spot light shadow map.
const CASCADE_VIEWPORT_X = [0, CASCADE_SIZE, 0];
const CASCADE_VIEWPORT_Y = [0, 0, CASCADE_SIZE];

// NDC corners used to reconstruct the view frustum in world space.
// Camera projection uses OpenGL convention: near → NDC Z = -1, far → NDC Z = +1.
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
  buffers: [GPUBuffer, GPUBuffer, GPUBuffer];
  bindGroups: [GPUBindGroup, GPUBindGroup, GPUBindGroup];
}

export class DirectionalShadowRenderer {
  shadowDepthTexture: GPUTexture;
  debugRenderer: ShadowDebugRenderer;
  /** True while shadow cascade debug tint is active — read by ShadowUniforms to set debugMode uniform. */
  debugMode: boolean = false;
  /** Per-cascade light VP matrices — updated each frame, read by ShadowUniforms.prepare(). */
  lightVPs: [Matrix4, Matrix4, Matrix4];
  /**
   * View-space depth at which each cascade ends, plus sun elevation in [3].
   *   [0] = end of cascade 0  (cascadeSplits.x in shader)
   *   [1] = end of cascade 1  (cascadeSplits.y in shader)
   *   [2] = SHADOW_CASCADE_FAR (cascadeSplits.z in shader)
   *   [3] = normalized sun direction Y (cascadeSplits.w) — used by shader to fade shadows near horizon
   */
  cascadeSplitDistances: Float32Array;

  private pipeline: GPURenderPipeline;
  private meshUniforms: Map<IVisualComponent, MeshShadowUniforms>;

  // Pre-allocated per-frame math — never allocated inside render().
  private _lightViewWorld: Matrix4;
  private _lightView: Matrix4;
  private _lightProj: Matrix4;
  private _shadowMVP: Matrix4;
  private _frustumCorners: Vector3[]; // 8 full-frustum corners (near + far planes)
  private _cascadeCorners: Vector3[]; // 8 sub-frustum corners for the current cascade
  private _lightPos: Vector3;
  private _frustumCenter: Vector3;
  private _lightDir: Vector3;
  private _lightUp: Vector3;
  private _matData: Float32Array;

  constructor() {
    this.debugRenderer = new ShadowDebugRenderer();
    this.lightVPs = [new Matrix4(), new Matrix4(), new Matrix4()];
    this.cascadeSplitDistances = new Float32Array(4);
    this.meshUniforms = new Map();
    this._lightViewWorld = new Matrix4();
    this._lightView = new Matrix4();
    this._lightProj = new Matrix4();
    this._shadowMVP = new Matrix4();
    this._frustumCorners = Array.from({ length: 8 }, () => new Vector3());
    this._cascadeCorners = Array.from({ length: 8 }, () => new Vector3());
    this._lightPos = new Vector3();
    this._frustumCenter = new Vector3();
    this._lightDir = new Vector3();
    this._lightUp = new Vector3();
    this._matData = new Float32Array(16);
  }

  init(renderer: Renderer): void {
    const { device } = renderer;

    // 2048×2048 atlas split into four 1024×1024 quadrants.
    // Cascades 0/1/2 use top-left / top-right / bottom-left; bottom-right is reserved.
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
        cullMode: 'none',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth32float',
        depthBiasSlopeScale: 2.0,
      },
    });

    this.debugRenderer.init(renderer, this.shadowDepthTexture);

    (window as any).startShadowDebug = () => {
      this.debugMode = true;
      this.debugRenderer.enabled = true;
      console.log('Shadow debug ON — cascade tint: red=0 green=1 blue=2 | atlas viewer: bottom-left');
    };
    (window as any).stopShadowDebug = () => {
      this.debugMode = false;
      this.debugRenderer.enabled = false;
      console.log('Shadow debug OFF');
    };
  }

  render(
    encoder: GPUCommandEncoder,
    renderList: IRenderGroup[],
    camera: PerspectiveCamera,
    renderer: Renderer
  ): void {
    const sun = renderer.sky?.skyRenderer?.sun;
    if (!sun) return;

    // When the sun is at or below the horizon its light comes from underground, which produces
    // broken shadows on terrain (backface-culled polygons leave the map in a garbage state).
    // In that case we still open the pass so the atlas clears to 1.0 (= fully lit / no shadow),
    // but we skip the cascade computation and all draw calls.
    const sunAboveHorizon = sun.transform.position.y > 0;

    const { device } = renderer;

    if (sunAboveHorizon) {
      this._computeCascadeLightVPs(camera, sun.transform.position);

      // Ensure per-mesh uniform buffers exist (geometry must already be built).
      for (const item of renderList) {
        if (item.geometry.requiresBuild) continue;
        for (const mesh of item.meshes) {
          this._ensureMeshUniforms(device, mesh);
        }
      }

      // Write all 3 cascade shadow MVPs for every mesh before opening the render pass.
      // Buffer writes must happen outside the pass so each cascade draw sees its own matrix.
      for (const item of renderList) {
        if (item.geometry.requiresBuild) continue;
        for (const mesh of item.meshes) {
          const uniforms = this.meshUniforms.get(mesh);
          if (!uniforms) continue;
          for (let c = 0; c < NUM_CASCADES; c++) {
            this._shadowMVP.multiplyMatrices(
              this.lightVPs[c],
              mesh.transform.matrixWorld
            );
            this._matData.set(this._shadowMVP.elements);
            device.queue.writeBuffer(
              uniforms.buffers[c],
              0,
              this._matData.buffer
            );
          }
        }
      }
    }

    const depthView = this.shadowDepthTexture.createView();
    const pass = encoder.beginRenderPass({
      label: 'directional shadow pass (CSM)',
      colorAttachments: [],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    if (sunAboveHorizon) {
      pass.setPipeline(this.pipeline);

      // Render all 3 cascades in a single pass — setViewport routes each into its atlas quadrant.
      for (let c = 0; c < NUM_CASCADES; c++) {
        pass.setViewport(
          CASCADE_VIEWPORT_X[c],
          CASCADE_VIEWPORT_Y[c],
          CASCADE_SIZE,
          CASCADE_SIZE,
          0,
          1
        );

        for (const item of renderList) {
          if (item.geometry.requiresBuild) continue;

          const geo = item.geometry;
          pass.setVertexBuffer(0, geo.vertexBuffer);
          pass.setIndexBuffer(geo.indexBuffer, 'uint32');
          const numIndices = geo.indices!.length;

          for (const mesh of item.meshes) {
            const uniforms = this.meshUniforms.get(mesh);
            if (!uniforms) continue;

            pass.setBindGroup(0, uniforms.bindGroups[c]);
            pass.drawIndexed(numIndices);
          }
        }
      }
    }

    pass.end();
  }

  dispose(): void {
    this.shadowDepthTexture?.destroy();
    for (const { buffers } of this.meshUniforms.values()) {
      for (const buf of buffers) buf.destroy();
    }
    this.meshUniforms.clear();
  }

  private _ensureMeshUniforms(device: GPUDevice, mesh: IVisualComponent): void {
    if (this.meshUniforms.has(mesh)) return;

    const buffers = [0, 1, 2].map(() =>
      device.createBuffer({
        label: 'shadow mesh MVP',
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })
    ) as [GPUBuffer, GPUBuffer, GPUBuffer];

    const bindGroups = buffers.map((buffer) =>
      device.createBindGroup({
        label: 'shadow mesh bind group',
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer } }],
      })
    ) as [GPUBindGroup, GPUBindGroup, GPUBindGroup];

    this.meshUniforms.set(mesh, { buffers, bindGroups });
  }

  private _computeCascadeLightVPs(
    camera: PerspectiveCamera,
    sunPosition: Vector3
  ): void {
    const camCamera = camera.camera;
    const projInv = camCamera.projectionMatrixInverse;
    const camWorld = camCamera.transform.matrixWorld;
    const camNear = camera.near;
    const camFar = camera.far;

    // --- Full-frustum corners in world space ---
    for (let i = 0; i < 8; i++) {
      const [nx, ny, nz] = NDC_CORNERS[i];
      this._frustumCorners[i].set(nx, ny, nz).unproject(projInv, camWorld);
    }

    // --- Light orientation (shared across all cascades) ---
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

    if (Math.abs(this._lightDir.y) > 0.99) {
      this._lightUp.set(1, 0, 0);
    } else {
      this._lightUp.set(0, 1, 0);
    }

    // --- Practical-split cascade distances ---
    // cascadeSplitDistances[i] is the VIEW-SPACE depth where cascade i ends.
    const shadowFar = Math.min(camFar, SHADOW_CASCADE_FAR);
    for (let i = 1; i <= NUM_CASCADES; i++) {
      const cLog = camNear * Math.pow(shadowFar / camNear, i / NUM_CASCADES);
      const cUni = camNear + (shadowFar - camNear) * (i / NUM_CASCADES);
      this.cascadeSplitDistances[i - 1] =
        CSM_LAMBDA * cLog + (1 - CSM_LAMBDA) * cUni;
    }
    this.cascadeSplitDistances[3] = this._lightDir.y; // sun elevation Y for shadow fade in shader

    // --- Compute one light VP per cascade ---
    let splitNear = camNear;
    for (let c = 0; c < NUM_CASCADES; c++) {
      const splitFar = this.cascadeSplitDistances[c];

      // Lerp fractions along the full frustum edges to get the cascade sub-frustum.
      // The frustum edges are linear in world space, so lerp is exact.
      const tNear = (splitNear - camNear) / (camFar - camNear);
      const tFar = (splitFar - camNear) / (camFar - camNear);

      for (let j = 0; j < 4; j++) {
        const nj = this._frustumCorners[j]; // near-plane corner j
        const fj = this._frustumCorners[j + 4]; // far-plane corner j
        // Near face of this cascade sub-frustum
        this._cascadeCorners[j].set(
          nj.x + (fj.x - nj.x) * tNear,
          nj.y + (fj.y - nj.y) * tNear,
          nj.z + (fj.z - nj.z) * tNear
        );
        // Far face of this cascade sub-frustum
        this._cascadeCorners[j + 4].set(
          nj.x + (fj.x - nj.x) * tFar,
          nj.y + (fj.y - nj.y) * tFar,
          nj.z + (fj.z - nj.z) * tFar
        );
      }

      this._computeLightVPForCascade(c);
      splitNear = splitFar;
    }
  }

  private _computeLightVPForCascade(cascadeIndex: number): void {
    // Cascade sub-frustum center for light positioning
    this._frustumCenter.set(0, 0, 0);
    for (let i = 0; i < 8; i++) {
      this._frustumCenter.x += this._cascadeCorners[i].x;
      this._frustumCenter.y += this._cascadeCorners[i].y;
      this._frustumCenter.z += this._cascadeCorners[i].z;
    }
    this._frustumCenter.x /= 8;
    this._frustumCenter.y /= 8;
    this._frustumCenter.z /= 8;

    const orbitDist = 2000;
    this._lightPos.set(
      this._frustumCenter.x + this._lightDir.x * orbitDist,
      this._frustumCenter.y + this._lightDir.y * orbitDist,
      this._frustumCenter.z + this._lightDir.z * orbitDist
    );

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
    this._lightView.copy(this._lightViewWorld).invert();

    // Fit ortho bounds tightly to the cascade sub-frustum corners in light space
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;

    const lve = this._lightView.elements;
    for (let i = 0; i < 8; i++) {
      const w = this._cascadeCorners[i];
      const lx = lve[0] * w.x + lve[4] * w.y + lve[8] * w.z + lve[12];
      const ly = lve[1] * w.x + lve[5] * w.y + lve[9] * w.z + lve[13];
      const lz = lve[2] * w.x + lve[6] * w.y + lve[10] * w.z + lve[14];
      if (lx < minX) minX = lx;
      if (lx > maxX) maxX = lx;
      if (ly < minY) minY = ly;
      if (ly > maxY) maxY = ly;
      if (lz < minZ) minZ = lz;
      if (lz > maxZ) maxZ = lz;
    }

    // Extend Z to catch shadow casters just outside the sub-frustum slice
    minZ -= 50;
    maxZ += 50;

    const nearDist = Math.max(0.1, -maxZ);
    const farDist = Math.max(nearDist + 1, -minZ);

    this._makeOrthoWebGPU(minX, maxX, maxY, minY, nearDist, farDist);
    this.lightVPs[cascadeIndex].multiplyMatrices(
      this._lightProj,
      this._lightView
    );
  }

  /** Builds an orthographic projection matrix using WebGPU depth convention [0, 1]. */
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
