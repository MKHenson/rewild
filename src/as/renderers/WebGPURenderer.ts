import { Camera } from "../cameras/Camera";
import { TransformNode } from "../core/TransformNode";
import { WebGPURenderQueue } from "./WebGPURenderQueue";
import { EngineMatrix4 } from "../math/Matrix4";
import { EngineVector4 } from "../math/Vector4";
import { MeshComponent } from "../components/MeshComponent";
import { WebGPUGeometries } from "./WebGPUGeometries";
import { GroupType } from "../../common/GroupType";
import { WebGPULights } from "./WebGPULights";
import { Light } from "../lights/Light";
import { AttributeType } from "../../common/AttributeType";
import { renderComponents } from "../Imports";
import { Component } from "../core/Component";

const renderQueue = new WebGPURenderQueue();

export class RenderList {
  solids: Component[];
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
  view!: EngineVector4;
  geometries: WebGPUGeometries;
  lights: WebGPULights;
  private _projScreenMatrix: EngineMatrix4;
  private currentRenderList: RenderList;

  constructor() {
    this._projScreenMatrix = new EngineMatrix4();
    this.currentRenderList = new RenderList();
    this.geometries = new WebGPUGeometries();
    this.lights = new WebGPULights();
  }

  init(view: EngineVector4): void {
    console.log(`Initializing WGPU renderer`);
    this.view = view;
  }

  render(scene: TransformNode, camera: Camera): void {
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

    let mesh: MeshComponent;
    let transform: TransformNode | null;
    for (let i: i32 = 0, l: i32 = this.currentRenderList.solids.length; i < l; i++) {
      mesh = unchecked(this.currentRenderList.solids[i]) as MeshComponent;
      // this.renderMesh(node, camera);

      transform = mesh.transform;
      if (!transform) return;

      transform.modelViewMatrix.multiplyMatricesSIMD(camera.matrixWorldInverse, transform.matrixWorld);
      transform.normalMatrix.getNormalMatrix(transform.modelViewMatrix);
    }

    renderComponents(camera, this.currentRenderList.solids);

    renderQueue.endPass();
    renderQueue.push();
  }

  renderMesh(mesh: MeshComponent, camera: Camera): void {
    const transform = mesh.transform;
    if (!transform) return;

    transform.modelViewMatrix.multiplyMatricesSIMD(camera.matrixWorldInverse, transform.matrixWorld);
    transform.normalMatrix.getNormalMatrix(transform.modelViewMatrix);
    const pipelineInstance = unchecked(mesh.pipelines[0]);

    // TODO:
    // ========================
    renderQueue.setPipeline(pipelineInstance.index);

    const transformIndex = pipelineInstance.transformResourceIndex;

    renderQueue.setTransform(
      transformIndex,
      camera.projectionMatrix.elements,
      transform.modelViewMatrix.elements,
      transform.matrixWorld.elements,
      transform.normalMatrix.elements
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

    const components = object.components;
    for (let i: i32 = 0, l = components.length; i < l; i++) {
      const component = unchecked(components[i]);
      if (component instanceof MeshComponent) {
        this.currentRenderList.solids.push(component as MeshComponent);
      }
    }

    if (object instanceof Light) {
      this.currentRenderList.lights.push(object as Light);
    }

    for (let i = 0, l = object.children.length; i < l; i++) this.projectObject(unchecked(object.children[i]), camera);
  }
}
