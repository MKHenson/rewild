// A contact-sheet render of the model, shaded against the same atlas it
// samples in the engine. The point is triage: at a hundred variants the only
// affordable review is a folder of thumbnails.

import type { MeshAttributes, TreeMesh } from './mesh.ts';
import type { Params } from './params.ts';
import type { Canvas, Canvases } from './textures.ts';
import type { Vec3 } from './vec.ts';

const LIGHT: Vec3 = [-0.42, 0.76, 0.5];
const SKY: Vec3 = [0.42, 0.52, 0.62];
const GROUND: Vec3 = [0.28, 0.26, 0.22];

// Three quarter view: enough turn to read the branching, enough tilt to see
// that the model stands on its origin.
const YAW = (28 * Math.PI) / 180;
const PITCH = (10 * Math.PI) / 180;

function toView(positions: Float32Array): Float32Array {
  const cy = Math.cos(YAW);
  const sy = Math.sin(YAW);
  const cp = Math.cos(PITCH);
  const sp = Math.sin(PITCH);
  const view = new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] * cy + positions[i + 2] * sy;
    const z = -positions[i] * sy + positions[i + 2] * cy;

    view[i] = x;
    view[i + 1] = positions[i + 1] * cp - z * sp;
    view[i + 2] = positions[i + 1] * sp + z * cp;
  }

  return view;
}

/**
 * One fit for the whole model. Fitting each primitive to its own bounds would
 * draw the canopy at a different scale from the trunk it hangs off.
 */
function createProjector(
  views: Float32Array[],
  size: number,
  margin: number
): (view: Float32Array) => Float32Array {
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

  for (const view of views)
    for (let i = 0; i < view.length; i += 3) {
      if (view[i] < bounds.minX) bounds.minX = view[i];
      if (view[i] > bounds.maxX) bounds.maxX = view[i];
      if (view[i + 1] < bounds.minY) bounds.minY = view[i + 1];
      if (view[i + 1] > bounds.maxY) bounds.maxY = view[i + 1];
    }

  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1;
  const scale = (size - margin * 2) / span;
  const offsetX = (size - (bounds.maxX + bounds.minX) * scale) / 2;
  const offsetY = (size + (bounds.maxY + bounds.minY) * scale) / 2;

  return (view) => {
    for (let i = 0; i < view.length; i += 3) {
      view[i] = view[i] * scale + offsetX;
      view[i + 1] = offsetY - view[i + 1] * scale;
    }
    return view;
  };
}

function shade(normal: Vec3, colour: Vec3): Vec3 {
  const lambert = Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]);
  const hemisphere = normal[1] * 0.5 + 0.5;

  const channel = (c: number): number =>
    Math.min(1, colour[c] * (0.35 * (SKY[c] * hemisphere + GROUND[c] * (1 - hemisphere)) * 2.4 + 0.85 * lambert));

  return [channel(0), channel(1), channel(2)];
}

function drawPrimitive(
  target: Buffer,
  depth: Float32Array,
  size: number,
  attributes: MeshAttributes,
  view: Float32Array,
  canvas: Canvas,
  cutout: boolean,
  cutoff: number,
  doubleSided: boolean,
  mirrorBackFaces: boolean
): void {
  const { indices, uvs, normals } = attributes;
  const atlas = canvas.size;

  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;

    const ax = view[ia];
    const ay = view[ia + 1];
    const bx = view[ib];
    const by = view[ib + 1];
    const cx = view[ic];
    const cy = view[ic + 1];

    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-6) continue;

    // Culled the way the engine culls, so a primitive wound inside out shows up
    // here as a hollow model rather than passing review and failing in the app.
    if (!doubleSided && area > 0) continue;

    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;

        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;

        const z = w0 * view[ia + 2] + w1 * view[ib + 2] + w2 * view[ic + 2];
        const pixel = y * size + x;
        if (z <= depth[pixel]) continue;

        const u = w0 * uvs[indices[t] * 2] + w1 * uvs[indices[t + 1] * 2] + w2 * uvs[indices[t + 2] * 2];
        const v = w0 * uvs[indices[t] * 2 + 1] + w1 * uvs[indices[t + 1] * 2 + 1] + w2 * uvs[indices[t + 2] * 2 + 1];

        // Wrapped on both axes, because both of bark's are: length repeats down
        // the image however long the branch is, and the ring closes across it.
        // Clamping either one smears its last row or column up the whole trunk.
        const tx = ((Math.floor(u * atlas) % atlas) + atlas) % atlas;
        const ty = ((Math.floor(v * atlas) % atlas) + atlas) % atlas;
        const texel = ty * atlas + tx;

        if (cutout && canvas.alpha[texel] < cutoff) continue;

        let nx = w0 * normals[ia] + w1 * normals[ib] + w2 * normals[ic];
        let ny = w0 * normals[ia + 1] + w1 * normals[ib + 1] + w2 * normals[ic + 1];
        let nz = w0 * normals[ia + 2] + w1 * normals[ib + 2] + w2 * normals[ic + 2];

        // The engine mirrors a back face's normal, and a preview that does not
        // hides every fault in a normal authored to ignore its own winding —
        // which is the one class of fault only a render can catch.
        const length = (Math.hypot(nx, ny, nz) || 1) * (mirrorBackFaces && area > 0 ? -1 : 1);
        nx /= length;
        ny /= length;
        nz /= length;

        const colour = shade([nx, ny, nz], [
          canvas.albedo[texel * 3],
          canvas.albedo[texel * 3 + 1],
          canvas.albedo[texel * 3 + 2],
        ]);

        depth[pixel] = z;
        target[pixel * 3] = Math.round(colour[0] * 255);
        target[pixel * 3 + 1] = Math.round(colour[1] * 255);
        target[pixel * 3 + 2] = Math.round(colour[2] * 255);
      }
    }
  }
}

/** RGB bytes of a `size` square preview. */
export function renderPreview(params: Params, mesh: TreeMesh, canvases: Canvases, size: number): Buffer {
  const target = Buffer.alloc(size * size * 3);
  const depth = new Float32Array(size * size).fill(-Infinity);

  for (let i = 0; i < size * size; i++) {
    const t = i / size / size;
    target[i * 3] = Math.round(mix(26, 44, t));
    target[i * 3 + 1] = Math.round(mix(30, 48, t));
    target[i * 3 + 2] = Math.round(mix(36, 52, t));
  }

  const views = [toView(mesh.bark.positions), toView(mesh.leaves.positions)];
  const project = createProjector(views, size, Math.round(size * 0.06));

  // One depth buffer across both, so a leaf behind a branch is hidden by it.
  // `card` is the one leaf mode whose normals are the cards' own, so it is the
  // one the engine's back-face mirror is right for. The others set
  // authoredNormals on the layer, which turns the mirror off there too.
  const mirrorLeaves = params.leafNormalMode === 'card';

  drawPrimitive(target, depth, size, mesh.bark, project(views[0]), canvases.bark, false, 0, false, true);
  drawPrimitive(target, depth, size, mesh.leaves, project(views[1]), canvases.leaves, true, params.leafAlphaCutoff, true, mirrorLeaves);

  return target;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
