const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** IEEE half-precision bits for `value`, rounded to nearest even. */
export function toFloat16(value: number): number {
  f32[0] = value;
  const bits = u32[0];
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  let mantissa = bits & 0x7fffff;

  if (exponent === 0xff) return sign | 0x7c00 | (mantissa ? 0x200 : 0);

  const e = exponent - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00;

  if (e <= 0) {
    if (e < -10) return sign;
    mantissa |= 0x800000;
    const shift = 14 - e;
    let half = mantissa >>> shift;
    const rest = mantissa & ((1 << shift) - 1);
    const midpoint = 1 << (shift - 1);
    if (rest > midpoint || (rest === midpoint && half & 1)) half++;
    return sign | half;
  }

  // A carry out of the mantissa rolls into the exponent, which is the correct
  // rounding up to the next power of two.
  let half = sign | (e << 10) | (mantissa >>> 13);
  const rest = mantissa & 0x1fff;
  if (rest > 0x1000 || (rest === 0x1000 && half & 1)) half++;
  return half;
}

/** The number held in half-precision bits `half`. */
export function fromFloat16(half: number): number {
  const sign = half & 0x8000 ? -1 : 1;
  const exponent = (half >>> 10) & 0x1f;
  const mantissa = half & 0x3ff;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 0x1f) return mantissa ? NaN : sign * Infinity;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}
