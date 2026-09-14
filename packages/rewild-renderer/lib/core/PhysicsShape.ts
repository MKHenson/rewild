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
    };

/** Why a shape cannot be registered, or null when it can. */
export function physicsShapeError(shape: PhysicsShape): string | null {
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
