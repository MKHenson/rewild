import { IAssetPlacement } from 'models';
import { Quaternion, Vector3 } from 'rewild-common';

/** The slice of TerrainRenderer conforming needs — kept narrow so the
 *  resolver is testable without a GPU device. */
export interface IHeightfieldSampler {
  sampleHeight(x: number, z: number): number | null;
  sampleNormal(x: number, z: number, out: Vector3): boolean;
}

const _normal = new Vector3();
const _tilt = new Quaternion();
const _stored = new Quaternion();
const _slerp = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _axis = new Vector3();

/**
 * The rotation taking world up onto `normal`, written into `out`. Antiparallel
 * normals resolve to a half turn about z, since any axis in the plane will do.
 */
export function quaternionFromUpToNormal(
  normal: Vector3,
  out: Quaternion
): Quaternion {
  const dot = _up.dot(normal);

  if (dot < -0.9999) return out.set(0, 0, 1, 0);
  if (dot > 0.9999) return out.set(0, 0, 0, 1);

  _axis.copy(_up).cross(normal).normalize();
  const halfAngle = Math.acos(dot) / 2;
  const s = Math.sin(halfAngle);
  return out.set(_axis.x * s, _axis.y * s, _axis.z * s, Math.cos(halfAngle));
}

/**
 * Writes the world transform a placement resolves to.
 *
 * Conformed placements take Y from the heightfield plus `yOffset` and lay the
 * stored orientation onto the slope by `alignToNormal`; everything else keeps
 * the stored absolute vec3 and quaternion. Returns true when the terrain
 * supplied the height — false means the stored values were used unchanged,
 * either because the object is not conformed or because the owning chunk has
 * no heights yet, in which case resolving again once it does will correct it.
 */
export function resolvePlacement(
  placement: IAssetPlacement,
  terrain: IHeightfieldSampler | null,
  outPosition: Vector3,
  outRotation: Quaternion
): boolean {
  const position = placement.position;
  const rotation = placement.rotation;

  outPosition.set(position[0], position[1], position[2]);
  if (rotation)
    outRotation.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  else outRotation.identity();

  if (!placement.conform || !terrain) return false;

  const height = terrain.sampleHeight(position[0], position[2]);
  if (height === null) return false;

  outPosition.y = height + (placement.yOffset ?? 0);

  const align = Math.min(1, Math.max(0, placement.alignToNormal ?? 0));
  if (align > 0 && terrain.sampleNormal(position[0], position[2], _normal)) {
    _stored.copy(outRotation);
    quaternionFromUpToNormal(_normal, _tilt);
    // Partial alignment slerps out from upright, and the tilt premultiplies so
    // it happens in world space and the stored yaw survives it.
    outRotation.identity().slerp(_tilt, align).multiply(_stored);
  }

  return true;
}

/**
 * Stores a world transform back onto a placement — the exact inverse of
 * `resolvePlacement`, so a drag round-trips without drifting.
 *
 * A conformed placement keeps x and z, converts Y into a `yOffset` above the
 * sampled surface, and strips the slope tilt the resolver will re-apply. When
 * the owning chunk has no heights the absolute vec3 is still written and
 * `yOffset` left alone, since there is nothing to measure the offset against.
 */
export function writeBackPlacement(
  placement: IAssetPlacement,
  terrain: IHeightfieldSampler | null,
  position: Vector3,
  rotation: [number, number, number, number]
): void {
  placement.position = [position.x, position.y, position.z];
  _stored.set(rotation[0], rotation[1], rotation[2], rotation[3]);

  if (placement.conform && terrain) {
    const height = terrain.sampleHeight(position.x, position.z);
    if (height !== null) placement.yOffset = position.y - height;

    const align = Math.min(1, Math.max(0, placement.alignToNormal ?? 0));
    if (align > 0 && terrain.sampleNormal(position.x, position.z, _normal)) {
      quaternionFromUpToNormal(_normal, _tilt);
      _stored.premultiply(_slerp.identity().slerp(_tilt, align).invert());
    }
  }

  placement.rotation = [_stored.x, _stored.y, _stored.z, _stored.w];
}

// Dropping on a slope has always tilted an object onto it, and conforming keeps
// that true through a sculpt rather than freezing the tilt at drop time.
const TERRAIN_ALIGN_TO_NORMAL = 1;

/**
 * Sets the conform fields from what a placement was just dropped or dragged
 * onto. Terrain conforms; anything else — another object, or empty space —
 * stores an absolute Y, because only the heightfield re-samples itself on
 * every path that moves it.
 *
 * Call before `writeBackPlacement`, which reads these to decide what to store.
 */
export function applyConformPolicy(
  placement: IAssetPlacement,
  onTerrain: boolean
): void {
  placement.conform = onTerrain;
  placement.alignToNormal = onTerrain ? TERRAIN_ALIGN_TO_NORMAL : 0;
  if (!onTerrain) placement.yOffset = 0;
}
