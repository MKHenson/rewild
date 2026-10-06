import { IRenderGroup } from '../../types/IRenderGroup';
import { IVisualComponent } from '../../types/interfaces';
import { isScatterInstanceGroup } from '../typeGuards';

// Front-to-back order for the opaque solids. A pipeline that can discard loses
// the GPU's hidden-surface removal but keeps its early depth test, and that
// test only rejects fragments behind something already drawn. Drawing near
// first lets it reject the far ones before they shade.

const keys = new Map<IVisualComponent, number>();
const groupKeys = new Map<IRenderGroup, number>();

/**
 * Metres from the camera to the nearest point a mesh can draw: its local
 * bounds when it has them, else its origin. A scatter group also draws nothing
 * nearer than its LOD tier's band, so a far tier sorts behind a near one even
 * in the same chunk. Transforms are assumed to translate only, as scatter
 * chunks do; a rotated mesh with bounds sorts by an approximate distance.
 */
export function nearestDrawDistance(
  mesh: IVisualComponent,
  cameraWorld: ArrayLike<number>
): number {
  const world = mesh.transform.matrixWorld.elements;
  const x = cameraWorld[12] - world[12];
  const y = cameraWorld[13] - world[13];
  const z = cameraWorld[14] - world[14];

  let distance: number;
  const bounds = mesh.localBounds;
  if (bounds) {
    const dx = Math.max(bounds.min.x - x, 0, x - bounds.max.x);
    const dy = Math.max(bounds.min.y - y, 0, y - bounds.max.y);
    const dz = Math.max(bounds.min.z - z, 0, z - bounds.max.z);
    distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  } else {
    distance = Math.sqrt(x * x + y * y + z * z);
  }

  return isScatterInstanceGroup(mesh)
    ? Math.max(distance, mesh.nearDistance)
    : distance;
}

/**
 * Orders `groups[from, to)` nearest first, by the nearest mesh in each. Scatter
 * groups also order their meshes nearest first. Other passes keep their mesh
 * order, since some bind per-mesh state by index.
 */
export function sortFrontToBack(
  groups: IRenderGroup[],
  from: number,
  to: number,
  cameraWorld: ArrayLike<number>
): void {
  if (to - from < 1) return;

  for (let i = from; i < to; i++) {
    const group = groups[i];
    const { meshes } = group;
    let nearest = Infinity;
    for (let m = 0; m < meshes.length; m++) {
      const key = nearestDrawDistance(meshes[m], cameraWorld);
      keys.set(meshes[m], key);
      if (key < nearest) nearest = key;
    }
    if (meshes.length > 1 && isScatterInstanceGroup(meshes[0]))
      meshes.sort((a, b) => keys.get(a)! - keys.get(b)!);
    groupKeys.set(group, nearest);
  }

  const range = groups.slice(from, to);
  range.sort((a, b) => groupKeys.get(a)! - groupKeys.get(b)!);
  for (let i = 0; i < range.length; i++) groups[from + i] = range[i];

  keys.clear();
  groupKeys.clear();
}
