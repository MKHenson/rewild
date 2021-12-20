import { Camera } from "../cameras/Camera";
import { Object } from "../core/Object";
import { WebGPURenderQueue } from "./WebGPURenderQueue";
import { print } from "../Imports";
import { Matrix4 } from "../math/Matrix4";
import { Vector4 } from "../math/Vector4";
import { Mesh } from "../objects/Mesh";
import { Scene } from "../scenes/Scene";
import { WebGPUGeometries } from "./WebGPUGeometries";
import { AttributeTypes } from "../core/BufferGeometry";
import { PipelineResourceType } from "../../common/PipelineResourceType";
import { WebGPULights } from "./WebGPULights";
import { Light } from "../lights/Light";

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
    print(`Initializing WGPU renderer`);
    this.view = view;
  }

  render(scene: Scene, camera: Camera): void {
    // update scene graph
    scene.updateMatrixWorld();

    // update camera matrices and frustum
    if (camera.parent === null) camera.updateMatrixWorld();

    scene.onBeforeRender();

    const _projScreenMatrix = this._projScreenMatrix;
    _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

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
    mesh.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
    mesh.normalMatrix.getNormalMatrix(mesh.modelViewMatrix);

    // TODO:
    // ========================
    renderQueue.setPipeline(mesh.pipelines[0].index);

    const transformIndex = mesh.pipelines[0].transformResourceIndex;

    renderQueue.setTransform(
      transformIndex,
      camera.projectionMatrix.elements,
      mesh.modelViewMatrix.elements,
      mesh.normalMatrix.elements
    );

    renderQueue.setBindGroupResource(PipelineResourceType.Transform, transformIndex);
    renderQueue.setBindGroupResource(PipelineResourceType.Material);
    renderQueue.setBindGroupResource(PipelineResourceType.Lighting);

    if (mesh.pipelines[0].diffuseResourceIndex != -1)
      renderQueue.setBindGroupResource(PipelineResourceType.Diffuse, mesh.pipelines[0].diffuseResourceIndex);
    // ========================

    if (mesh.geometry) {
      const attributeMap = this.geometries.get(mesh.geometry);
      if (attributeMap) {
        if (attributeMap.attributeBuffers.has(AttributeTypes.POSITION))
          renderQueue.setBuffer(0, attributeMap.attributeBuffers.get(AttributeTypes.POSITION));

        if (attributeMap.attributeBuffers.has(AttributeTypes.NORMAL))
          renderQueue.setBuffer(1, attributeMap.attributeBuffers.get(AttributeTypes.NORMAL));

        if (attributeMap.attributeBuffers.has(AttributeTypes.UV))
          renderQueue.setBuffer(2, attributeMap.attributeBuffers.get(AttributeTypes.UV));

        if (attributeMap.indexBuffer != -1) {
          renderQueue.setIndexBuffer(attributeMap.indexBuffer);
          renderQueue.drawIndexed(mesh.geometry.indexes!.count);
        } else {
        }
      }
    }
  }

  projectObject(object: Object, camera: Camera): void {
    if (object.visible === false) return;

    if (object instanceof Mesh) {
      this.currentRenderList.solids.push(object as Mesh);
    } else if (object instanceof Light) {
      this.currentRenderList.lights.push(object as Light);
    }

    for (let i = 0, l = object.children.length; i < l; i++) this.projectObject(object.children[i], camera);
  }
}
