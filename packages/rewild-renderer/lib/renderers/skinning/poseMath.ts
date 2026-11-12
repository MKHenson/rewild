/** Quaternion and vector helpers on flat pose arrays, as x, y, z, w at an offset. */

/** Quaternion `a * b` into `out` at `o`. Safe when `out` is an input. */
export function multiply(
  out: Float32Array,
  o: number,
  a: Float32Array,
  ao: number,
  b: Float32Array,
  bo: number
): void {
  const ax = a[ao];
  const ay = a[ao + 1];
  const az = a[ao + 2];
  const aw = a[ao + 3];
  const bx = b[bo];
  const by = b[bo + 1];
  const bz = b[bo + 2];
  const bw = b[bo + 3];
  out[o] = aw * bx + ax * bw + ay * bz - az * by;
  out[o + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[o + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** The inverse of unit quaternion `q` into `out` at `o`. */
export function conjugate(
  out: Float32Array,
  o: number,
  q: Float32Array,
  qo: number
): void {
  out[o] = -q[qo];
  out[o + 1] = -q[qo + 1];
  out[o + 2] = -q[qo + 2];
  out[o + 3] = q[qo + 3];
}

/** (x, y, z) turned by unit quaternion `q`, into `out` at `o`. */
export function rotate(
  out: Float32Array,
  o: number,
  q: Float32Array,
  qo: number,
  x: number,
  y: number,
  z: number
): void {
  const qx = q[qo];
  const qy = q[qo + 1];
  const qz = q[qo + 2];
  const qw = q[qo + 3];
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  out[o] = x + qw * tx + qy * tz - qz * ty;
  out[o + 1] = y + qw * ty + qz * tx - qx * tz;
  out[o + 2] = z + qw * tz + qx * ty - qy * tx;
}

/** A turn of `angle` about unit axis (x, y, z), into `out` at 0. */
export function aboutAxis(
  out: Float32Array,
  x: number,
  y: number,
  z: number,
  angle: number
): void {
  const s = Math.sin(angle * 0.5);
  out[0] = x * s;
  out[1] = y * s;
  out[2] = z * s;
  out[3] = Math.cos(angle * 0.5);
}

/** The shortest turn from direction (ax, ay, az) to (bx, by, bz), into `out` at 0. */
export function between(
  out: Float32Array,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): void {
  const la = Math.hypot(ax, ay, az);
  const lb = Math.hypot(bx, by, bz);
  if (la === 0 || lb === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return;
  }
  const dot = (ax * bx + ay * by + az * bz) / (la * lb);
  if (dot < -0.999999) {
    // Opposite directions: a half turn about any axis across `a`.
    const alongX = Math.abs(ax) >= 0.9 * la;
    const x = alongX ? -az : 0;
    const y = alongX ? 0 : az;
    const z = alongX ? ax : -ay;
    const l = Math.hypot(x, y, z);
    out[0] = x / l;
    out[1] = y / l;
    out[2] = z / l;
    out[3] = 0;
    return;
  }
  out[0] = (ay * bz - az * by) / (la * lb);
  out[1] = (az * bx - ax * bz) / (la * lb);
  out[2] = (ax * by - ay * bx) / (la * lb);
  out[3] = 1 + dot;
  const l = Math.hypot(out[0], out[1], out[2], out[3]);
  out[0] /= l;
  out[1] /= l;
  out[2] /= l;
  out[3] /= l;
}
