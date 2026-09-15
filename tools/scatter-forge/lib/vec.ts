// Minimal vector helpers on plain tuples. The tool runs in node with no engine
// imports, so it carries its own rather than reaching into rewild-common.

export type Vec3 = [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 1e-8 ? scale(a, 1 / l) : [0, 1, 0];
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Rodrigues rotation of `v` about the unit `axis` by `angle` radians. */
export function rotateAbout(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = cross(axis, v);
  const d = dot(axis, v) * (1 - c);
  return [
    v[0] * c + k[0] * s + axis[0] * d,
    v[1] * c + k[1] * s + axis[1] * d,
    v[2] * c + k[2] * s + axis[2] * d,
  ];
}

/** Any unit vector perpendicular to `a`, chosen to avoid the degenerate axis. */
export function perpendicular(a: Vec3): Vec3 {
  const reference: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize(cross(a, reference));
}

/**
 * Rotates `from` onto `to` and applies the same rotation to `v`. Used to carry
 * a ring's frame along a curving branch without letting it twist, which is what
 * a fresh perpendicular at every point would do.
 */
export function transport(v: Vec3, from: Vec3, to: Vec3): Vec3 {
  const axis = cross(from, to);
  const sin = length(axis);
  if (sin < 1e-8) return dot(from, to) > 0 ? v : scale(v, -1);
  return rotateAbout(v, scale(axis, 1 / sin), Math.atan2(sin, dot(from, to)));
}
