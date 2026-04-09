import { Ray, Vector3 } from 'rewild-common';
import { Mesh, Renderer, Transform } from 'rewild-renderer';
import { Raycaster, Intersection } from 'rewild-renderer/lib/core/Raycaster';

const _raycaster = new Raycaster();
const _downRay = new Ray();
const _downDir = new Vector3(0, -1, 0);
const _up = new Vector3(0, 1, 0);
const _axis = new Vector3();
const _size = new Vector3();

export function computeRotationFromNormal(
  normal: Vector3
): [number, number, number, number] {
  const dot = _up.dot(normal);

  if (dot < -0.9999) {
    return [0, 0, 1, 0];
  } else if (dot > 0.9999) {
    return [0, 0, 0, 1];
  } else {
    _axis.copy(_up).cross(normal).normalize();
    const angle = Math.acos(dot);
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    return [_axis.x * s, _axis.y * s, _axis.z * s, Math.cos(halfAngle)];
  }
}

export function computeObjectHalfHeight(transform: Transform): number {
  if (transform.component instanceof Mesh) {
    transform.component.geometry.computeBoundingBox();
    const bbox = transform.component.geometry.boundingBox;
    if (bbox) {
      bbox.getSize(_size);
      return _size.y / 2;
    }
  }
  return 0;
}

export function raycastToSurface(
  renderer: Renderer,
  worldPosition: Vector3,
  excludeTransforms?: Transform[]
): Intersection | null {
  _raycaster.far = 200;
  _downRay.origin.set(worldPosition.x, worldPosition.y + 100, worldPosition.z);
  _downRay.direction.copy(_downDir);
  _raycaster.ray.copy(_downRay);

  const intersects = _raycaster.intersectObjects([renderer.scene], true);

  for (const hit of intersects) {
    if (
      excludeTransforms &&
      excludeTransforms.some((t) => isDescendantOf(hit.object, t))
    ) {
      continue;
    }
    return hit;
  }
  return null;
}

export function placeOnSurface(
  renderer: Renderer,
  position: Vector3,
  halfHeight: number,
  excludeTransforms?: Transform[]
): { y: number; rotation: [number, number, number, number] } | null {
  const hit = raycastToSurface(renderer, position, excludeTransforms);
  if (!hit || !hit.face) return null;

  return {
    y: hit.point.y + halfHeight,
    rotation: computeRotationFromNormal(hit.face.normal),
  };
}

export function raycastMouseToWorld(
  mouseRay: Ray,
  renderer: Renderer,
  excludeTransforms?: Transform[],
  maxDistance: number = 500
): Intersection | null {
  _raycaster.far = maxDistance;
  _raycaster.ray.copy(mouseRay);

  const intersects = _raycaster.intersectBVHScene(renderer.sceneBVH!);

  for (const hit of intersects) {
    if (
      excludeTransforms &&
      excludeTransforms.some((t) => isDescendantOf(hit.object, t))
    ) {
      continue;
    }
    return hit;
  }
  return null;
}

function isDescendantOf(transform: Transform, ancestor: Transform): boolean {
  let current: Transform | null = transform;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}
