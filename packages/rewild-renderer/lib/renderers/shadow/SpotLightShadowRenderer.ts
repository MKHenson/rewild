import { Matrix4, Vector3 } from 'rewild-common';
import { Renderer } from '../../Renderer';
import { PerspectiveCamera } from '../../core/PerspectiveCamera';
import { IRenderGroup } from '../../../types/IRenderGroup';
import { IVisualComponent } from '../../../types/interfaces';
import { SpotLight } from '../../core/lights/SpotLight';
import shader from '../../shaders/shadow-depth.wgsl';
import { SHADOW_MAP_SIZE } from './DirectionalShadowRenderer';

// Spot light shadow occupies the bottom-right quadrant of the 2048×2048 atlas.
const SPOT_SIZE = SHADOW_MAP_SIZE / 2; // 1024
const SPOT_VIEWPORT_X = SPOT_SIZE;
const SPOT_VIEWPORT_Y = SPOT_SIZE;

interface MeshShadowUniforms {
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
}

export class SpotLightShadowRenderer {
  /** True when a shadow-casting spot light was found this frame. */
  hasSpotShadow: boolean = false;
  /** Light VP matrix (world-space) — read by ShadowUniforms.prepare() to form lightMVPFromView. */
  lightVP: Matrix4;

  private pipeline: GPURenderPipeline;
  private meshUniforms: Map<IVisualComponent, MeshShadowUniforms>;

  private _lightViewWorld: Matrix4;
  private _lightView: Matrix4;
  private _lightProj: Matrix4;
  private _shadowMVP: Matrix4;
  private _lightPos: Vector3;
  private _lightTarget: Vector3;
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
    this._lightPos = new Vector3();
    this._lightTarget = new Vector3();
    this._lightDir = new Vector3();
    this._lightUp = new Vector3();
    this._matData = new Float32Array(16);
  }

  init(renderer: Renderer): void {
    const { device } = renderer;

    const module = device.createShaderModule({
      label: 'spot light shadow depth shader',
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'spot light shadow pipeline',
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
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
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
    _camera: PerspectiveCamera,
    renderer: Renderer
  ): void {
    const spotLight = this._findShadowCastingSpotLight(renderer);
    if (!spotLight) {
      this.hasSpotShadow = false;
      return;
    }

    this.hasSpotShadow = true;
    this._computeSpotLightVP(spotLight);

    const shadowAtlas = renderer.shadowAtlas;
    if (!shadowAtlas) return;

    const { device } = renderer;

    for (const item of renderList) {
      if (item.geometry.requiresBuild) continue;
      for (const mesh of item.meshes) {
        this._ensureMeshUniforms(device, mesh);
      }
    }

    for (const item of renderList) {
      if (item.geometry.requiresBuild) continue;
      for (const mesh of item.meshes) {
        const uniforms = this.meshUniforms.get(mesh);
        if (!uniforms) continue;
        this._shadowMVP.multiplyMatrices(this.lightVP, mesh.transform.matrixWorld);
        this._matData.set(this._shadowMVP.elements);
        device.queue.writeBuffer(uniforms.buffer, 0, this._matData.buffer);
      }
    }

    // The directional pass already cleared the entire atlas to 1.0, so load (no re-clear).
    const pass = encoder.beginRenderPass({
      label: 'spot light shadow pass',
      colorAttachments: [],
      depthStencilAttachment: {
        view: shadowAtlas.createView(),
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      },
    });

    pass.setPipeline(this.pipeline);
    pass.setViewport(SPOT_VIEWPORT_X, SPOT_VIEWPORT_Y, SPOT_SIZE, SPOT_SIZE, 0, 1);

    for (const item of renderList) {
      if (item.geometry.requiresBuild) continue;

      const geo = item.geometry;
      pass.setVertexBuffer(0, geo.vertexBuffer);
      pass.setIndexBuffer(geo.indexBuffer, 'uint32');
      const numIndices = geo.indices!.length;

      for (const mesh of item.meshes) {
        const uniforms = this.meshUniforms.get(mesh);
        if (!uniforms) continue;
        pass.setBindGroup(0, uniforms.bindGroup);
        pass.drawIndexed(numIndices);
      }
    }

    pass.end();
  }

  dispose(): void {
    for (const { buffer } of this.meshUniforms.values()) {
      buffer.destroy();
    }
    this.meshUniforms.clear();
  }

  private _findShadowCastingSpotLight(renderer: Renderer): SpotLight | null {
    for (const light of renderer.currentRenderList.lights) {
      if (light instanceof SpotLight && light.castShadow) {
        return light as SpotLight;
      }
    }
    return null;
  }

  private _computeSpotLightVP(light: SpotLight): void {
    this._lightPos.copy(light.transform.position);
    this._lightTarget.copy(light.target.position);

    this._lightDir.subVectors(this._lightTarget, this._lightPos).normalize();
    if (Math.abs(this._lightDir.y) > 0.99) {
      this._lightUp.set(1, 0, 0);
    } else {
      this._lightUp.set(0, 1, 0);
    }

    this._lightViewWorld.lookAt(this._lightPos, this._lightTarget, this._lightUp);
    this._lightViewWorld.setPosition(this._lightPos.x, this._lightPos.y, this._lightPos.z);
    this._lightView.copy(this._lightViewWorld).invert();

    this._makePerspectiveWebGPU(light.outerAngle * 2, 0.1, light.range);
    this.lightVP.multiplyMatrices(this._lightProj, this._lightView);
  }

  /** Perspective matrix using WebGPU depth convention [0, 1], aspect ratio 1:1. */
  private _makePerspectiveWebGPU(fovY: number, near: number, far: number): void {
    const f = 1.0 / Math.tan(fovY * 0.5);
    const rangeInv = 1.0 / (near - far);
    const te = this._lightProj.elements;

    te[0]  = f;  te[4]  = 0;  te[8]  = 0;               te[12] = 0;
    te[1]  = 0;  te[5]  = f;  te[9]  = 0;               te[13] = 0;
    te[2]  = 0;  te[6]  = 0;  te[10] = far * rangeInv;  te[14] = near * far * rangeInv;
    te[3]  = 0;  te[7]  = 0;  te[11] = -1;              te[15] = 0;
  }

  private _ensureMeshUniforms(device: GPUDevice, mesh: IVisualComponent): void {
    if (this.meshUniforms.has(mesh)) return;

    const buffer = device.createBuffer({
      label: 'spot shadow mesh MVP',
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      label: 'spot shadow mesh bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer } }],
    });

    this.meshUniforms.set(mesh, { buffer, bindGroup });
  }
}
