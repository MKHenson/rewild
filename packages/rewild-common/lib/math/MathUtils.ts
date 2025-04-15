import { Quaternion } from './Quaternion';

const _lut: string[] = [];
for (let i = 0; i < 256; i++) {
  _lut[i] = (i < 16 ? '0' : '') + i.toString(16);
}

let _seed = 1234567;

export const DEG2RAD: f32 = Mathf.PI / 180;
export const RAD2DEG: f32 = 180 / Mathf.PI;

// http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
export function generateUUID(): string {
  const d0: u32 = u32(Mathf.random() * 0xffffffff) | 0;
  const d1: u32 = u32(Mathf.random() * 0xffffffff) | 0;
  const d2: u32 = u32(Mathf.random() * 0xffffffff) | 0;
  const d3: u32 = u32(Mathf.random() * 0xffffffff) | 0;

  const uuid: string =
    _lut[d0 & 0xff] +
    _lut[(d0 >> 8) & 0xff] +
    _lut[(d0 >> 16) & 0xff] +
    _lut[(d0 >> 24) & 0xff] +
    '-' +
    _lut[d1 & 0xff] +
    _lut[(d1 >> 8) & 0xff] +
    '-' +
    _lut[((d1 >> 16) & 0x0f) | 0x40] +
    _lut[(d1 >> 24) & 0xff] +
    '-' +
    _lut[(d2 & 0x3f) | 0x80] +
    _lut[(d2 >> 8) & 0xff] +
    '-' +
    _lut[(d2 >> 16) & 0xff] +
    _lut[(d2 >> 24) & 0xff] +
    _lut[d3 & 0xff] +
    _lut[(d3 >> 8) & 0xff] +
    _lut[(d3 >> 16) & 0xff] +
    _lut[(d3 >> 24) & 0xff];

  // .toUpperCase() here flattens concatenated strings to save heap memory space.
  return uuid.toUpperCase();
}

export function clamp(value: f32, min: f32, max: f32): f32 {
  return Mathf.max(min, Mathf.min(max, value));
}

// compute euclidian modulo of m % n
// https://en.wikipedia.org/wiki/Modulo_operation
export function euclideanModulo(n: f32, m: f32): f32 {
  return ((n % m) + m) % m;
}

// Linear mapping from range <a1, a2> to range <b1, b2>
export function mapLinear(x: f32, a1: f32, a2: f32, b1: f32, b2: f32): f32 {
  return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1);
}

// https://www.gamedev.net/tutorials/programming/general-and-gameplay-programming/inverse-lerp-a-super-useful-yet-often-overlooked-function-r5230/
export function inverseLerp(x: f32, y: f32, value: f32): f32 {
  if (x != y) {
    return (value - x) / (y - x);
  } else {
    return 0;
  }
}

// https://en.wikipedia.org/wiki/Linear_interpolation
export function lerp(x: f32, y: f32, t: f32): f32 {
  return (1 - t) * x + t * y;
}

// http://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/
export function damp(x: f32, y: f32, lambda: f32, dt: f32): f32 {
  return lerp(x, y, 1 - Mathf.exp(-lambda * dt));
}

// https://www.desmos.com/calculator/vcsjnyz7x4
export function pingpong(x: f32, length: f32 = 1): f32 {
  return length - Mathf.abs(euclideanModulo(x, length * 2) - length);
}

// http://en.wikipedia.org/wiki/Smoothstep
export function smoothstep(x: f32, min: f32, max: f32): f32 {
  if (x <= min) return 0;
  if (x >= max) return 1;

  x = (x - min) / (max - min);

  return x * x * (3 - 2 * x);
}

export function smootherstep(x: f32, min: f32, max: f32): f32 {
  if (x <= min) return 0;
  if (x >= max) return 1;

  x = (x - min) / (max - min);

  return x * x * x * (x * (x * 6 - 15) + 10);
}

// Random integer from <low, high> interval
export function randInt(low: f32, high: f32): f32 {
  return low + Mathf.floor(Mathf.random() * (high - low + 1));
}

// Random float from <low, high> interval
export function randFloat(low: f32, high: f32): f32 {
  return low + Mathf.random() * (high - low);
}

// Random float from <-range/2, range/2> interval
export function randFloatSpread(range: f32): f32 {
  return range * (0.5 - Mathf.random());
}

// Deterministic pseudo-random float in the interval [ 0, 1 ]
export function seededRandom(s: f32): f32 {
  if (s != undefined) _seed = s % 2147483647;

  // Park-Miller algorithm

  _seed = (_seed * 16807) % 2147483647;

  return (_seed - 1) / 2147483646;
}

export function degToRad(degrees: f32): f32 {
  return degrees * DEG2RAD;
}

export function radToDeg(radians: f32): f32 {
  return radians * RAD2DEG;
}

export function isPowerOfTwo(value: f32): boolean {
  return (value & (value - 1)) === 0 && value != 0;
}

export function ceilPowerOfTwo(value: f32): f32 {
  return Mathf.pow(2, Mathf.ceil(Mathf.log(value) / Mathf.LN2));
}

export function floorPowerOfTwo(value: f32): f32 {
  return Mathf.pow(2, Mathf.floor(Mathf.log(value) / Mathf.LN2));
}

export function setQuaternionFromProperEuler(
  q: Quaternion,
  a: f32,
  b: f32,
  c: f32,
  order: string
): void {
  // Intrinsic Proper Euler Angles - see https://en.wikipedia.org/wiki/Euler_angles

  // rotations are applied to the axes in the order specified by 'order'
  // rotation by angle 'a' is applied first, then by angle 'b', then by angle 'c'
  // angles are in radians

  const cos = Mathf.cos;
  const sin = Mathf.sin;

  const c2 = cos(b / 2);
  const s2 = sin(b / 2);

  const c13 = cos((a + c) / 2);
  const s13 = sin((a + c) / 2);

  const c1_3 = cos((a - c) / 2);
  const s1_3 = sin((a - c) / 2);

  const c3_1 = cos((c - a) / 2);
  const s3_1 = sin((c - a) / 2);

  switch (order) {
    case 'XYX':
      q.set(c2 * s13, s2 * c1_3, s2 * s1_3, c2 * c13);
      break;

    case 'YZY':
      q.set(s2 * s1_3, c2 * s13, s2 * c1_3, c2 * c13);
      break;

    case 'ZXZ':
      q.set(s2 * c1_3, s2 * s1_3, c2 * s13, c2 * c13);
      break;

    case 'XZX':
      q.set(c2 * s13, s2 * s3_1, s2 * c3_1, c2 * c13);
      break;

    case 'YXY':
      q.set(s2 * c3_1, c2 * s13, s2 * s3_1, c2 * c13);
      break;

    case 'ZYZ':
      q.set(s2 * s3_1, s2 * c3_1, c2 * s13, c2 * c13);
      break;

    default:
      console.warn(
        'THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: ' +
          order
      );
  }
}
