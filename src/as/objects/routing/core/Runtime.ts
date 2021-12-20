// import { Object } from "./core/Object";
// import { PerspectiveCamera } from "./cameras/PerspectiveCamera";
// import { GridAxis } from "./primitives/Grid";
// import { Mesh } from "./objects/Mesh";
// import { Vao } from "./objects/Vao";
// import { BoxGeometry } from "./geometries/BoxGeometry";
// import { SphereGeometry } from "./geometries/SphereGeometry";
// import { CapsuleGeometry } from "./geometries/CapsuleGeometry";
// import { Material } from "./materials/Material";
// import { DebugMaterial } from "./materials/DebugMaterial";
// import { toNormalizedCoord } from "./extras/PickHelper";
// import { Raycaster } from "./core/Raycaster";
// import { PlaneGeometry } from "./geometries/PlaneGeometry";
// import { MeshBasicMaterial } from "./materials/MeshBasicMaterial";
// import { Scene } from "./scenes/Scene";
// import { Listener } from "./core/EventDispatcher";
// import { Renderer } from "./renderers/webgl/WebGLRenderer";
// import inputManager from "./input/ASInputManager";
// import { Event } from "./core/Event";
// import { MouseEvent } from ".";

// export class MainScene extends Listener {
//   renderer: Renderer;
//   width: f32;
//   height: f32;
//   raycaster: Raycaster;
//   activeCamera: PerspectiveCamera;
//   scene: Scene;
//   camDolly: Object;
//   radians: f32 = 0;
//   camRotation: f32 = 0;
//   quad: Mesh;
//   basicMat: MeshBasicMaterial;
//   debugMat: DebugMaterial;
//   materialsMap: Map<Vao, Material>;

//   constructor(width: f32, height: f32, renderer: Renderer) {
//     super();
//     this.width = width;
//     this.height = height;
//     this.renderer = renderer;
//     this.raycaster = new Raycaster();

//     this.scene = new Scene();
//     this.camDolly = new Object();
//     this.basicMat = new MeshBasicMaterial();
//     this.debugMat = new DebugMaterial();
//     this.materialsMap = new Map();

//     const planeGeom = new PlaneGeometry();
//     const cubeGeom = new BoxGeometry();
//     const sphereGeom = new SphereGeometry(0.5);
//     const capsuleGeom = new CapsuleGeometry();

//     const grid = GridAxis.createMesh(new Material(), true);
//     this.quad = new Vao(planeGeom, this.basicMat).createFromGeom();
//     const cube = new Vao(cubeGeom, this.basicMat).createFromGeom();
//     const sphere = new Vao(sphereGeom, this.basicMat).createFromGeom();
//     const capsule = new Vao(capsuleGeom, this.debugMat).createFromGeom();

//     this.scene.add(this.camDolly);
//     this.scene.add(grid);
//     this.scene.add(this.quad);
//     this.scene.add(cube);
//     this.scene.add(sphere);
//     this.scene.add(capsule);

//     for (let i: i32 = 0, l: i32 = this.scene.children.length; i < l; i++) {
//       if (this.scene.children[i] instanceof Vao)
//         this.materialsMap.set(this.scene.children[i] as Vao, (this.scene.children[i] as Vao).materials[0]);
//     }

//     cube.translateX(1);
//     sphere.translateX(-1);
//     capsule.translateZ(-2);

//     this.activeCamera = new PerspectiveCamera(45, f32(width) / f32(height));
//     this.activeCamera.translateY(1).translateZ(3);
//     this.activeCamera.lookAt(0, 0, 0);
//     this.camDolly.add(this.activeCamera);

//     inputManager.addEventListener("mousemove", this);
//   }

//   OnLoop(delta: f32, total: u32, fps: u32): void {
//     this.radians += delta * 5;
//     this.camRotation -= delta * 0.5;
//     this.quad.rotation.x = this.radians;
//     this.camDolly.rotation.y = this.camRotation;

//     this.scene.update(delta, total);
//     this.renderer.render(this.scene, this.activeCamera);
//   }

//   onResize(width: f32, height: f32): void {
//     this.width = f32(width);
//     this.height = f32(height);
//     this.activeCamera.aspect = f32(width) / f32(height);
//     this.activeCamera.updateProjectionMatrix();
//   }

//   onEvent(event: Event): void {
//     const mouseEvent = event.attachment as MouseEvent;

//     // Set all geometry to the original material
//     const keys = this.materialsMap.keys();
//     for (let i: i32 = 0; i < keys.length; i++) {
//       keys[i].materials = [this.materialsMap.get(keys[i])];
//     }

//     const getCanvasRelativePositionX: f32 =
//       (f32(mouseEvent.clientX - mouseEvent.targetX) * this.width) / f32(mouseEvent.targetWidth);
//     const getCanvasRelativePositionY: f32 =
//       (f32(mouseEvent.clientY - mouseEvent.targetY) * this.height) / f32(mouseEvent.targetHeight);

//     const normalizedCoords = toNormalizedCoord(
//       getCanvasRelativePositionX,
//       getCanvasRelativePositionY,
//       this.width,
//       this.height
//     );
//     this.raycaster.setFromCamera(normalizedCoords, this.activeCamera);
//     const intersection = this.raycaster.intersectObjects(this.scene.children);
//     if (intersection) {
//       for (let i: i32 = 0; i < intersection.length; i++)
//         if (intersection[i].object instanceof Mesh) {
//           const mesh = intersection[i].object as Mesh;
//           mesh.materials.splice(0, 1);
//           mesh.materials.push(this.debugMat);
//         }
//     }
//   }
// }

import { Listener } from "../../../core/EventDispatcher";
import { WebGPURenderer } from "../../../renderers/webGPU/WebGPURenderer";
import { inputManager } from "../../../exports/ASInputManager";
import { Event } from "../../../core/Event";
import { Scene } from "../../../scenes/Scene";
import { PerspectiveCamera } from "../../../cameras/PerspectiveCamera";
import { Container } from "./Container";

export class Runtime implements Listener {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  private activeNodes: Container[];

  constructor(width: f32, height: f32, renderer: WebGPURenderer) {
    this.activeNodes = [];

    this.renderer = renderer;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(45, f32(width) / f32(height), 0.1, 1000);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.camera);

    inputManager.addEventListener("mousemove", this);
  }

  addContainer(container: Container): void {
    container.runtime = this;
    this.activeNodes.push(container);
  }

  OnLoop(delta: f32, total: u32, fps: u32): void {
    const activeNodes = this.activeNodes;

    for (let i: i32 = 0, l: i32 = activeNodes.length; i < l; i++) {
      const node = activeNodes[i];

      if (!node.initialized) node.init();
      if (!node.mounted) node.mount();
    }

    for (let i: i32 = 0, l: i32 = activeNodes.length; i < l; i++) {
      activeNodes[i].onUpdate(delta, total, fps);
    }

    this.renderer.render(this.scene, this.camera);
  }

  onResize(width: f32, height: f32): void {
    this.camera.aspect = f32(width) / f32(height);
    this.camera.updateProjectionMatrix();
  }

  onEvent(event: Event): void {}
}
