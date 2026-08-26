import { Box3, Matrix4, Quaternion, Ray, Vector3 } from 'rewild-common';
import { Mesh, Renderer, Transform } from 'rewild-renderer';
import { Raycaster, Intersection } from 'rewild-renderer/lib/core/Raycaster';
import { quaternionFromUpToNormal } from 'src/core/placement/ConformedPlacement';
import { TerrainChunk } from 'rewild-renderer/lib/renderers/terrain/TerrainChunk';

const _raycaster = new Raycaster();
const _downRay = new Ray();
const _downDir = new Vector3(0, -1, 0);
const _rotation = new Quaternion();
const _bounds = new Box3();
const _meshBounds = new Box3();
const _inverseRoot = new Matrix4();
const _toRoot = new Matrix4();

export function computeRotationFromNormal(
  normal: Vector3
): [number, number, number, number] {
  quaternionFromUpToNormal(normal, _rotation);
  return [_rotation.x, _rotation.y, _rotation.z, _rotation.w];
}

/** Unions every descendant mesh's bounds into `_bounds`, in root-local space. */
function expandBoundsFromMeshes(transform: Transform): void {
  const component = transform.component;

  if (component instanceof Mesh) {
    const geometry = component.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();

    if (geometry.boundingBox) {
      _meshBounds.copy(geometry.boundingBox);
      _toRoot.multiplyMatrices(_inverseRoot, transform.matrixWorld);
      _meshBounds.applyMatrix4(_toRoot);
      _bounds.union(_meshBounds);
    }
  }

  for (const child of transform.children) expandBoundsFromMeshes(child);
}

/**
 * How far above a surface an object's origin must sit for the object to rest on
 * it — the drop from the origin down to its lowest point.
 */
export function computeGroundOffset(transform: Transform): number {
  // Bounds are gathered in the root's own space, so an object still outside the
  // scene measures the same as one already parented into it.
  transform.updateMatrixWorld(true);
  _inverseRoot.copy(transform.matrixWorld).invert();
  _bounds.makeEmpty();

  expandBoundsFromMeshes(transform);

  return _bounds.isEmpty() ? 0 : -_bounds.min.y;
}

export function raycastToSurface(
  renderer: Renderer,
  worldPosition: Vector3,
  excludeTransforms?: Transform[],
  // The down-ray starts castFrom above worldPosition.y and travels range —
  // callers scanning for surfaces far from their reference height (e.g. the
  // orbit camera's ground probe) pass a wider window.
  castFrom: number = 100,
  range: number = 200
): Intersection | null {
  _raycaster.far = range;
  _downRay.origin.set(
    worldPosition.x,
    worldPosition.y + castFrom,
    worldPosition.z
  );
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

/**
 * Whether a raycast hit landed on terrain. The hit reports the LOD mesh, whose
 * owner is the chunk, so the walk up the parents is what identifies it.
 */
export function isTerrainTransform(transform: Transform | null): boolean {
  let current = transform;
  while (current) {
    if (current.component instanceof TerrainChunk) return true;
    current = current.parent;
  }
  return false;
}

export function placeOnSurface(
  renderer: Renderer,
  position: Vector3,
  groundOffset: number,
  excludeTransforms?: Transform[]
): {
  y: number;
  rotation: [number, number, number, number];
  onTerrain: boolean;
} | null {
  const hit = raycastToSurface(renderer, position, excludeTransforms);
  if (!hit || !hit.face) return null;

  return {
    y: hit.point.y + groundOffset,
    rotation: computeRotationFromNormal(hit.face.normal),
    onTerrain: isTerrainTransform(hit.object),
  };
}

export function raycastMouseToWorld(
  mouseRay: Ray,
  renderer: Renderer,
  excludeTransforms?: Transform[],
  // Defaults to the camera's far plane: anything the author can see is
  // something they can drop onto. A fixed reach shorter than the draw
  // distance silently stops finding terrain part-way to the horizon, and the
  // caller's fallback then places the object somewhere else entirely.
  maxDistance: number = renderer.camera.far
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
