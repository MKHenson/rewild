import { Camera } from "../cameras/Camera";
import { OrthographicCamera } from "../cameras/OrthographicCamera";
import { PerspectiveCamera } from "../cameras/PerspectiveCamera";
import { Ray } from "../math/Ray";
import { Vector2 } from "../math/Vector2";
import { Vector3 } from "../math/Vector3";
import { Intersection, Mesh } from "../objects/Mesh";
import { Layers } from "./Layers";
import { TransformNode } from "./TransformNode";

// export class RayCasterParams {
//   public Mesh: Mesh | null;
//   Line: { threshold: 1 };
//   LOD: {};
//   Points: { threshold: 1 };
//   Sprite: {};
// }

export class Raycaster {
  ray: Ray;
  near: f32;
  far: f32;
  camera: Camera | null;
  layers: Layers;
  // params: RayCasterParams;

  constructor(origin: Vector3 = new Vector3(), direction: Vector3 = new Vector3(), near: f32 = 0, far: f32 = Infinity) {
    this.ray = new Ray(origin, direction);
    // direction is assumed to be normalized (for accurate distance calculations)

    this.near = near;
    this.far = far;
    this.camera = null;
    this.layers = new Layers();

    // this.params = {
    //   Mesh: {},
    //   Line: { threshold: 1 },
    //   LOD: {},
    //   Points: { threshold: 1 },
    //   Sprite: {},
    // };
  }

  set(origin: Vector3, direction: Vector3): void {
    // direction is assumed to be normalized (for accurate distance calculations)
    this.ray.set(origin, direction);
  }

  setFromCamera(coords: Vector2, camera: Camera): void {
    if (camera && camera instanceof PerspectiveCamera) {
      const pCam = camera as PerspectiveCamera;
      this.ray.origin.setFromMatrixPosition(pCam.matrixWorld);
      this.ray.direction.set(coords.x, coords.y, 0.5).unproject(camera).sub(this.ray.origin).normalize();
      this.camera = camera;
    } else if (camera && camera instanceof OrthographicCamera) {
      const oCam = camera as OrthographicCamera;
      this.ray.origin.set(coords.x, coords.y, (oCam.near + oCam.far) / (oCam.near - oCam.far)).unproject(oCam); // set origin in plane of camera
      this.ray.direction.set(0, 0, -1).transformDirection(oCam.matrixWorld);
      this.camera = oCam;
    }
  }

  intersectObject(object: TransformNode, recursive: boolean = false, intersects: Intersection[] = []): Intersection[] {
    intersectObject(object, this, intersects, recursive);

    intersects.sort(ascSort);

    return intersects;
  }

  intersectObjects(
    objects: TransformNode[],
    recursive: boolean = false,
    intersects: Intersection[] = []
  ): Intersection[] {
    for (let i = 0, l = objects.length; i < l; i++) {
      intersectObject(objects[i], this, intersects, recursive);
    }

    intersects.sort(ascSort);

    return intersects;
  }
}

function ascSort(a: Intersection, b: Intersection): i32 {
  return i32(a.distance) - i32(b.distance);
}

function intersectObject(
  object: TransformNode,
  raycaster: Raycaster,
  intersects: Intersection[],
  recursive: boolean
): void {
  if (object.layers.test(raycaster.layers)) {
    object.raycast(raycaster, intersects);
  }

  if (recursive === true) {
    const children = object.children;

    for (let i = 0, l = children.length; i < l; i++) {
      intersectObject(children[i], raycaster, intersects, true);
    }
  }
}
