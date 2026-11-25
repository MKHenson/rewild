import { Vector3 } from 'rewild-common';
import { rayToSurface, UISurface, UISurfaceOptions } from 'rewild-gpu-ui';
import { Intersection, Raycaster } from './Raycaster';
import { Transform } from './Transform';
import { IComponent, IRaycaster } from '../../types/interfaces';

export type UISurface3DOptions = Omit<UISurfaceOptions, 'kind'>;

/**
 * A world UI surface on a transform. Add the transform to the scene to show
 * the surface, and remove it to hide it. The renderer gives the surface its
 * transform's world matrix each frame. The surface's centre is at the
 * transform's origin, and its front faces +z.
 */
export class UISurface3D implements IComponent {
  readonly transform: Transform;
  readonly surface: UISurface;

  constructor(options: UISurface3DOptions) {
    this.surface = new UISurface({ ...options, kind: 'world' });
    this.transform = new Transform();
    this.transform.component = this;
  }

  /** Hits the surface's quad from the front or the back. */
  raycast(raycaster: IRaycaster, intersects: Intersection[]) {
    if (!(raycaster instanceof Raycaster)) return;
    const surface = this.surface;
    const { origin, direction } = raycaster.ray;
    const hit = rayToSurface(
      origin,
      direction,
      this.transform.matrixWorld,
      surface.size,
      surface.pixelsPerMetre
    );
    if (!hit) return;
    if (hit.x < 0 || hit.y < 0) return;
    if (hit.x > surface.layoutWidth || hit.y > surface.layoutHeight) return;
    if (hit.distance < raycaster.near || hit.distance > raycaster.far) return;

    const intersection = new Intersection();
    intersection.distance = hit.distance;
    intersection.point = new Vector3()
      .copy(direction)
      .multiplyScalar(hit.distance)
      .add(origin);
    intersection.object = this.transform;
    intersection.face = null;
    intersects.push(intersection);
  }
}

/** The part of the UI renderer that shows world surfaces. */
export interface UISurfaceHost {
  addSurface(surface: UISurface): unknown;
  removeSurface(surface: UISurface): void;
}

/**
 * Keeps the UI's world surfaces to the UISurface3Ds in the scene. The
 * renderer collects them each frame and calls `update`.
 */
export class UISurface3DList {
  private shown = new Set<UISurface3D>();
  private next = new Set<UISurface3D>();

  update(inScene: readonly UISurface3D[], host: UISurfaceHost): void {
    const next = this.next;
    next.clear();
    for (const panel of inScene) {
      next.add(panel);
      panel.surface.worldMatrix.copy(panel.transform.matrixWorld);
      if (!this.shown.has(panel)) host.addSurface(panel.surface);
    }
    for (const panel of this.shown)
      if (!next.has(panel)) host.removeSurface(panel.surface);
    this.next = this.shown;
    this.shown = next;
  }
}
