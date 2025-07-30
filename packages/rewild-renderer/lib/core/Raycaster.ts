import { Ray, Vector2, Vector3 } from 'rewild-common';
import { Layers } from './Layers';
import { ICameraController } from '../../types/ICamera';
import { PerspectiveCamera } from './PerspectiveCamera';
import { OrthographicCamera } from './OrthographicCamera';
import { Transform } from './Transform';
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
  camera: ICameraController | null;
  layers: Layers;
  // params: RayCasterParams;

  constructor(
    origin: Vector3 = new Vector3(),
    direction: Vector3 = new Vector3(),
    near: f32 = 0,
    far: f32 = Infinity
  ) {
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

  setFromCamera(coords: Vector2, camera: ICameraController): void {
    if (camera && camera instanceof PerspectiveCamera) {
      const pCam = camera as PerspectiveCamera;
      this.ray.origin.setFromMatrixPosition(pCam.camera.transform.matrixWorld);
      (this.ray.direction.set(coords.x, coords.y, 0.5) as Vector3)
        .unproject(
          camera.camera.projectionMatrixInverse,
          camera.camera.transform.matrixWorld
        )
        .sub(this.ray.origin)
        .normalize();
      this.camera = camera;
    } else if (camera && camera instanceof OrthographicCamera) {
      const oCam = camera as OrthographicCamera;
      (
        this.ray.origin.set(
          coords.x,
          coords.y,
          (oCam.near + oCam.far) / (oCam.near - oCam.far)
        ) as Vector3
      ).unproject(
        oCam.camera.projectionMatrixInverse,
        camera.camera.transform.matrixWorld
      ); // set origin in plane of camera
      this.ray.direction
        .set(0, 0, -1)
        .transformDirection(oCam.camera.transform.matrixWorld);
      this.camera = oCam;
    }
  }

  intersectObject(
    object: Transform,
    recursive: boolean = false,
    intersects: Intersection[] = []
  ): Intersection[] {
    intersectObject(object, this, intersects, recursive);

    intersects.sort(ascSort);

    return intersects;
  }

  intersectObjects(
    objects: Transform[],
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
  object: Transform,
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

export class Face {
  public a: i32;
  public b: i32;
  public c: i32;
  public normal: Vector3;
  public materialIndex: i32;
}

export class Intersection {
  public distance: f32;
  public point: Vector3;
  public normal: Vector3;
  public object: Transform;
  public faceIndex: i32;
  public face: Face | null;
  public uv: Vector2 | null;
  public uv1: Vector2 | null;
  public uv2: Vector2 | null;
  public barycoord: Vector3 | null;
  public instanceId: i32;
}
