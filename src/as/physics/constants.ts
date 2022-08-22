/*
 * A list of constants built-in for
 * the physics engine.
 */

export const REVISION: string = "1.0.9";

// BroadPhase
export const BR_NULL: i32 = 0;
export const BR_BRUTE_FORCE: i32 = 1;
export const BR_SWEEP_AND_PRUNE: i32 = 2;
export const BR_BOUNDING_VOLUME_TREE: i32 = 3;

// Body type
export const BODY_NULL: i32 = 0;
export const BODY_DYNAMIC: i32 = 1;
export const BODY_STATIC: i32 = 2;
export const BODY_KINEMATIC: i32 = 3;
export const BODY_GHOST: i32 = 4;

// Shape type
export const SHAPE_NULL: i32 = 0;
export const SHAPE_SPHERE: i32 = 1;
export const SHAPE_BOX: i32 = 2;
export const SHAPE_CYLINDER: i32 = 3;
export const SHAPE_PLANE: i32 = 4;
export const SHAPE_PARTICLE: i32 = 5;
export const SHAPE_TETRA: i32 = 6;

// Joint type
export const JOINT_NULL: i32 = 0;
export const JOINT_DISTANCE: i32 = 1;
export const JOINT_BALL_AND_SOCKET: i32 = 2;
export const JOINT_HINGE: i32 = 3;
export const JOINT_WHEEL: i32 = 4;
export const JOINT_SLIDER: i32 = 5;
export const JOINT_PRISMATIC: i32 = 6;

// AABB aproximation
export const AABB_PROX: i32 = 0.005;
