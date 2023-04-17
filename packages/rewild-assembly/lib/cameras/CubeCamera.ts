// import { Object3D } from "../core/Object3D";
// import { Vector3 } from "../math/Vector3";
// import { Scene } from "../scenes/Scene";
// import { Camera } from "./Camera";
// import { PerspectiveCamera } from "./PerspectiveCamera";

// const fov: f32 = 90,
//   aspect: f32 = 1;

// export class CubeCamera extends Object3D {
//   constructor(near: f32, far: f32, renderTarget) {
//     super();

//     this.type = "CubeCamera";
//     this.renderTarget = renderTarget;

//     const cameraPX = new PerspectiveCamera(fov, aspect, near, far);
//     cameraPX.layers = this.layers;
//     cameraPX.up.set(0, -1, 0);
//     cameraPX.lookAt(1, 0, 0);
//     this.add(cameraPX);

//     const cameraNX = new PerspectiveCamera(fov, aspect, near, far);
//     cameraNX.layers = this.layers;
//     cameraNX.up.set(0, -1, 0);
//     cameraNX.lookAt(-1, 0, 0);
//     this.add(cameraNX);

//     const cameraPY = new PerspectiveCamera(fov, aspect, near, far);
//     cameraPY.layers = this.layers;
//     cameraPY.up.set(0, 0, 1);
//     cameraPY.lookAt(0, 1, 0);
//     this.add(cameraPY);

//     const cameraNY = new PerspectiveCamera(fov, aspect, near, far);
//     cameraNY.layers = this.layers;
//     cameraNY.up.set(0, 0, -1);
//     cameraNY.lookAt(0, -1, 0);
//     this.add(cameraNY);

//     const cameraPZ = new PerspectiveCamera(fov, aspect, near, far);
//     cameraPZ.layers = this.layers;
//     cameraPZ.up.set(0, -1, 0);
//     cameraPZ.lookAt(0, 0, 1);
//     this.add(cameraPZ);

//     const cameraNZ = new PerspectiveCamera(fov, aspect, near, far);
//     cameraNZ.layers = this.layers;
//     cameraNZ.up.set(0, -1, 0);
//     cameraNZ.lookAt(0, 0, -1);
//     this.add(cameraNZ);
//   }

//   update(renderer, scene: Scene) {
//     if (this.parent == null) this.updateMatrixWorld();

//     const renderTarget = this.renderTarget;

//     const [
//       cameraPX,
//       cameraNX,
//       cameraPY,
//       cameraNY,
//       cameraPZ,
//       cameraNZ,
//     ]: Camera[] = this.children as Camera[];

//     const currentXrEnabled = renderer.xr.enabled;
//     const currentRenderTarget = renderer.getRenderTarget();

//     renderer.xr.enabled = false;

//     const generateMipmaps = renderTarget.texture.generateMipmaps;

//     renderTarget.texture.generateMipmaps = false;

//     renderer.setRenderTarget(renderTarget, 0);
//     renderer.render(scene, cameraPX);

//     renderer.setRenderTarget(renderTarget, 1);
//     renderer.render(scene, cameraNX);

//     renderer.setRenderTarget(renderTarget, 2);
//     renderer.render(scene, cameraPY);

//     renderer.setRenderTarget(renderTarget, 3);
//     renderer.render(scene, cameraNY);

//     renderer.setRenderTarget(renderTarget, 4);
//     renderer.render(scene, cameraPZ);

//     renderTarget.texture.generateMipmaps = generateMipmaps;

//     renderer.setRenderTarget(renderTarget, 5);
//     renderer.render(scene, cameraNZ);

//     renderer.setRenderTarget(currentRenderTarget);

//     renderer.xr.enabled = currentXrEnabled;
//   }
// }
