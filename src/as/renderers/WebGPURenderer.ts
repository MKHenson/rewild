import { Camera } from "../cameras/Camera";
import { TransformNode } from "../core/TransformNode";
import { WebGPURenderQueue } from "./WebGPURenderQueue";
import { Matrix4 } from "../math/Matrix4";
import { Vector4 } from "../math/Vector4";
import { Mesh } from "../objects/Mesh";
import { Scene } from "../scenes/Scene";
import { WebGPUGeometries } from "./WebGPUGeometries";
import { GroupType } from "../../common/GroupType";
import { WebGPULights } from "./WebGPULights";
import { Light } from "../lights/Light";
import { AttributeType } from "../../common/AttributeType";

const renderQueue = new WebGPURenderQueue();

export class RenderList {
  solids: Mesh[];
  lights: Light[];

  constructor() {
    this.solids = [];
    this.lights = [];
  }

  reset(): void {
    this.solids.splice(0, this.solids.length);
    this.lights.splice(0, this.lights.length);
  }
}

export class WebGPURenderer {
  view!: Vector4;
  geometries: WebGPUGeometries;
  lights: WebGPULights;
  private _projScreenMatrix: Matrix4;
  private currentRenderList: RenderList;

  constructor() {
    this._projScreenMatrix = new Matrix4();
    this.currentRenderList = new RenderList();
    this.geometries = new WebGPUGeometries();
    this.lights = new WebGPULights();
  }

  init(view: Vector4): void {
    console.log(`Initializing WGPU renderer`);
    this.view = view;
  }

  render(scene: Scene, camera: Camera): void {
    // update scene graph
    scene.updateMatrixWorld();

    // update camera matrices and frustum
    if (camera.parent === null) camera.updateMatrixWorld();

    scene.onBeforeRender();

    const _projScreenMatrix = this._projScreenMatrix;
    _projScreenMatrix.multiplyMatricesSIMD(camera.projectionMatrix, camera.matrixWorldInverse);

    this.currentRenderList.reset();
    this.projectObject(scene, camera);

    this.lights.setupLights(this.currentRenderList.lights, camera);

    renderQueue.begin();
    renderQueue.startPass();

    renderQueue.setupLighting(this.lights);

    for (let i: i32 = 0, l: i32 = this.currentRenderList.solids.length; i < l; i++) {
      this.renderMesh(this.currentRenderList.solids[i], camera);
    }

    renderQueue.endPass();
    renderQueue.push();
  }

  renderMesh(mesh: Mesh, camera: Camera): void {
    mesh.modelViewMatrix.multiplyMatricesSIMD(camera.matrixWorldInverse, mesh.matrixWorld);
    mesh.normalMatrix.getNormalMatrix(mesh.modelViewMatrix);
    const pipelineInstance = mesh.pipelines[0];

    // TODO:
    // ========================
    renderQueue.setPipeline(pipelineInstance.index);

    const transformIndex = pipelineInstance.transformResourceIndex;

    renderQueue.setTransform(
      transformIndex,
      camera.projectionMatrix.elements,
      mesh.modelViewMatrix.elements,
      mesh.matrixWorld.elements,
      mesh.normalMatrix.elements
    );

    renderQueue.setBindGroupResource(GroupType.Transform, transformIndex);
    renderQueue.setBindGroupResource(GroupType.Material);

    // ===========================

    if (mesh.geometry) {
      const attributeMap = this.geometries.get(mesh.geometry);
      if (attributeMap) {
        if (
          attributeMap.attributeBuffers.has(AttributeType.POSITION) &&
          pipelineInstance.attributes.has(AttributeType.POSITION)
        ) {
          renderQueue.setBuffer(
            pipelineInstance.attributes.get(AttributeType.POSITION),
            attributeMap.attributeBuffers.get(AttributeType.POSITION)
          );
        }

        if (
          attributeMap.attributeBuffers.has(AttributeType.NORMAL) &&
          pipelineInstance.attributes.has(AttributeType.NORMAL)
        ) {
          renderQueue.setBuffer(
            pipelineInstance.attributes.get(AttributeType.NORMAL),
            attributeMap.attributeBuffers.get(AttributeType.NORMAL)
          );
        }

        if (attributeMap.attributeBuffers.has(AttributeType.UV) && pipelineInstance.attributes.has(AttributeType.UV)) {
          renderQueue.setBuffer(
            pipelineInstance.attributes.get(AttributeType.UV),
            attributeMap.attributeBuffers.get(AttributeType.UV)
          );
        }

        if (attributeMap.indexBuffer != -1) {
          renderQueue.setIndexBuffer(attributeMap.indexBuffer);
          renderQueue.drawIndexed(mesh.geometry.indexes!.count);
        } else {
        }
      }
    }
  }

  projectObject(object: TransformNode, camera: Camera): void {
    if (object.visible === false) return;

    if (object instanceof Mesh) {
      this.currentRenderList.solids.push(object as Mesh);
    } else if (object instanceof Light) {
      this.currentRenderList.lights.push(object as Light);
    }

    for (let i = 0, l = object.children.length; i < l; i++) this.projectObject(object.children[i], camera);
  }
}
