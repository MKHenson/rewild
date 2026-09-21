export type PhysicsShape =
  | {
      type: 'box';
      /** Full extents; halved for Rapier at registration. */
      size: [number, number, number];
      offset?: [number, number, number];
    }
  | { type: 'sphere'; radius: number; offset?: [number, number, number] }
  | {
      type: 'capsule';
      radius: number;
      /** Cylindrical section only, excluding the caps — Rapier's halfHeight * 2. */
      height: number;
      offset?: [number, number, number];
    }
  | {
      type: 'hull';
      /** Flat xyz triples in model space; Rapier takes their convex hull. */
      points: number[];
      offset?: [number, number, number];
    };

/** Fewest points that span a volume rather than a plane. */
export const HULL_MIN_POINTS = 4;

/** Why a shape cannot be registered, or null when it can. */
export function physicsShapeError(shape: PhysicsShape): string | null {
  if (shape.type === 'hull') {
    const { points } = shape;
    if (points.length % 3 !== 0 || points.length < HULL_MIN_POINTS * 3)
      return `hull collider needs at least ${HULL_MIN_POINTS} xyz points`;
    if (points.some((value) => !Number.isFinite(value)))
      return 'hull collider points must be finite';
    return null;
  }

  const invalid =
    shape.type === 'box'
      ? shape.size.some((extent) => extent <= 0)
      : shape.type === 'sphere'
      ? shape.radius <= 0
      : shape.radius <= 0 || shape.height <= 0;

  return invalid
    ? `${shape.type} collider must have positive dimensions`
    : null;
}
