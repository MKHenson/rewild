import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/portal.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { PortalUniforms } from './uniforms/PortalUniforms';
import { PortalArcs } from '../renderers/portal/PortalArcs';
import { PointLight } from '../core/lights/PointLight';

const portalGroupIndex = 1;
/** Longest step the lightning takes in one frame, so a stall does not skip it. */
const MAX_ARC_STEP = 0.1;

/**
 * A sphere that shows another place through it. Opaque and depth-writing, so
 * the atmosphere composite fogs it like any other surface. Draw it on the unit
 * sphere geometry, scaled by the transform to the portal's radius.
 */
export class PortalPass implements IMaterialPass {
  pipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  sharedUniformsTracker: SharedUniformsTracker;
  requiresRebuild = true;
  side: GPUFrontFace = 'ccw';
  portal: PortalUniforms;
  /** The portal's centre in world space and its radius, as of the last `update`. */
  centreX = 0;
  centreY = 0;
  centreZ = 0;
  radius = 1;
  /** Whether the main camera drew it since the last `update`. */
  inView = false;
  readonly arcs = new PortalArcs();
  /**
   * Glows with the portal and flashes with its lightning: `lightIntensity`,
   * plus `lightFlash` per bolt at full brightness, both times the portal's glow.
   * Intensities are at 1m, as PointLight's are.
   */
  light: PointLight | null = null;
  lightIntensity = 1500;
  lightFlash = 3500;
  /** Scales the light's steady glow, for a portal that is not fully open. */
  lightGlowScale = 1;

  constructor() {
    this.portal = new PortalUniforms(portalGroupIndex);
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [this.portal]);
    this.perMeshTracker = new PerMeshTracker(this, () => [
      new ProjModelView(0),
    ]);
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({ code: shader });

    this.pipeline = device.createRenderPipeline({
      label: 'Portal Pass',
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
      fragment: {
        entryPoint: 'fs',
        module,
        targets: renderer.sceneTargets({ format: sceneColorFormat }, true),
      },
      multisample: { count: renderer.sampleCount },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
        frontFace: this.side,
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    this.portal.requiresBuild = true;
    this.perMeshTracker.meshUniforms.forEach((uniforms) => {
      for (const uniform of uniforms) uniform.requiresBuild = true;
    });
  }

  dispose(): void {
    this.sharedUniformsTracker.dispose();
    this.perMeshTracker.dispose();
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return !!geometry.vertices;
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: Mesh[],
    geometry: Geometry
  ): void {
    this.portal.syncTexture(renderer);
    pass.setPipeline(this.pipeline);
    if (
      !this.sharedUniformsTracker.prepareMeshUniforms(
        renderer,
        pass,
        camera,
        meshes
      )
    )
      return;

    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');
    const numIndices = geometry.indices!.length;
    if (camera === renderer.camera.camera) this.inView = true;
    for (const mesh of meshes) {
      this.perMeshTracker.prepareMeshUniforms(mesh, renderer, pass, camera);
      pass.drawIndexed(numIndices);
    }
  }

  /** The light's intensity now: its glow plus the lightning's flash. */
  get lightLevel(): number {
    return (
      (this.lightIntensity * this.lightGlowScale +
        this.lightFlash * this.arcs.flash) *
      this.portal.glow
    );
  }

  /**
   * Places the portal, advances its lightning and sets the light from it.
   * Called every frame by the renderer, before drawing, once registered with
   * `renderer.addPortal`, whether or not the portal is in view. The renderer's
   * portal effects draw only the portals `inView`.
   */
  update(renderer: Renderer): void {
    this.inView = false;
    const mesh = this.sharedUniformsTracker.meshes[0] as Mesh | undefined;
    if (!mesh) return;
    const e = mesh.transform.matrixWorld.elements;
    this.centreX = e[12];
    this.centreY = e[13];
    this.centreZ = e[14];
    this.radius = Math.hypot(e[0], e[1], e[2]);
    const seconds = Math.min(renderer.delta / 1000, MAX_ARC_STEP);
    this.arcs.update(seconds, e[12], e[13], e[14], this.radius);
    if (this.light) this.light.intensity = this.lightLevel;
  }
}
