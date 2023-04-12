import { Vec3 } from "./Vec3";

export class _Math {
  // sqrt   : Math.sqrt,
  // abs    : Math.abs,
  // floor  : Math.floor,
  // cos    : Math.cos,
  // sin    : Math.sin,
  // acos   : Math.acos,
  // asin   : Math.asin,
  // atan2  : Math.atan2,
  // round  : Math.round,
  // pow    : Math.pow,
  // max    : Math.max,
  // min    : Math.min,
  // random : Math.random,

  static degtorad: f32 = 0.0174532925199432957;
  static radtodeg: f32 = 57.295779513082320876;
  static PI: f32 = 3.141592653589793;
  static TwoPI: f32 = 6.283185307179586;
  static PI90: f32 = 1.570796326794896;
  static PI270: f32 = 4.712388980384689;

  static INF: f32 = Infinity;
  static EPZ: f32 = 0.00001;
  static EPZ2: f32 = 0.000001;

  static lerp(x: f32, y: f32, t: f32): f32 {
    return (1 - t) * x + t * y;
  }

  static randInt(low: f32, high: f32): i32 {
    return i32(low + Mathf.floor(Mathf.random() * (high - low + 1)));
  }

  static rand(low: f32, high: f32): f32 {
    return low + Mathf.random() * (high - low);
  }

  // static generateUUID(): string {
  //   // http://www.broofa.com/Tools/Math.uuid.htm

  //   let chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split("");
  //   let uuid = new Array(36);
  //   let rnd: f32 = 0,
  //     r: f32;

  //   return function generateUUID() {
  //     for (let i = 0; i < 36; i++) {
  //       if (i === 8 || i === 13 || i === 18 || i === 23) {
  //         uuid[i] = "-";
  //       } else if (i === 14) {
  //         uuid[i] = "4";
  //       } else {
  //         if (rnd <= 0x02) rnd = (0x2000000 + Math.random() * 0x1000000) | 0;
  //         r = rnd & 0xf;
  //         rnd = rnd >> 4;
  //         uuid[i] = chars[i === 19 ? (r & 0x3) | 0x8 : r];
  //       }
  //     }

  //     return uuid.join("");
  //   };
  // }

  static int(x: f32): i32 {
    return i32(x);
  }

  // static fix(x: f32, n: f32): f32 {
  //   return x.toFixed(n || 3, 10);
  // }

  static clamp(value: f32, min: f32, max: f32): f32 {
    return Mathf.max(min, Mathf.min(max, value));
  }

  //clamp( x, a, b ) { return ( x < a ) ? a : ( ( x > b ) ? b : x ); },

  static distance(p1: f32[], p2: f32[]): f32 {
    let xd = p2[0] - p1[0];
    let yd = p2[1] - p1[1];
    let zd = p2[2] - p1[2];
    return Mathf.sqrt(xd * xd + yd * yd + zd * zd);
  }

  /*unwrapDegrees( r ) {

        r = r % 360;
        if (r > 180) r -= 360;
        if (r < -180) r += 360;
        return r;

    },

    unwrapRadian: function( r ){

        r = r % _Math.TwoPI;
        if (r > _Math.PI) r -= _Math.TwoPI;
        if (r < -_Math.PI) r += _Math.TwoPI;
        return r;

    },*/

  static acosClamp(cos: f32): f32 {
    if (cos > 1) return 0;
    else if (cos < -1) return Mathf.PI;
    else return Mathf.acos(cos);
  }

  static distanceVector(v1: Vec3, v2: Vec3): f32 {
    let xd = v1.x - v2.x;
    let yd = v1.y - v2.y;
    let zd = v1.z - v2.z;
    return xd * xd + yd * yd + zd * zd;
  }

  static dotVectors(a: Vec3, b: Vec3): f32 {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
}
