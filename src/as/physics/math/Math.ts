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

  degtorad: f32 = 0.0174532925199432957;
  radtodeg: f32 = 57.295779513082320876;
  PI: f32 = 3.141592653589793;
  TwoPI: f32 = 6.283185307179586;
  PI90: f32 = 1.570796326794896;
  PI270: f32 = 4.712388980384689;

  INF: f32 = Infinity;
  EPZ: f32 = 0.00001;
  EPZ2: f32 = 0.000001;

  lerp(x: f32, y: f32, t: f32): f32 {
    return (1 - t) * x + t * y;
  }

  randInt(low: f32, high: f32): i32 {
    return i32(low + Mathf.floor(Mathf.random() * (high - low + 1)));
  }

  rand(low: f32, high: f32): f32 {
    return low + Mathf.random() * (high - low);
  }

  generateUUID() {
    // http://www.broofa.com/Tools/Math.uuid.htm

    var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split("");
    var uuid = new Array(36);
    var rnd = 0,
      r;

    return function generateUUID() {
      for (var i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) {
          uuid[i] = "-";
        } else if (i === 14) {
          uuid[i] = "4";
        } else {
          if (rnd <= 0x02) rnd = (0x2000000 + Math.random() * 0x1000000) | 0;
          r = rnd & 0xf;
          rnd = rnd >> 4;
          uuid[i] = chars[i === 19 ? (r & 0x3) | 0x8 : r];
        }
      }

      return uuid.join("");
    };
  }

  int(x: f32): i32 {
    return i32(x);
  }

  fix(x: f32, n: f32): f32 {
    return x.toFixed(n || 3, 10);
  }

  clamp(value: f32, min: f32, max: f32): f32 {
    return Mathf.max(min, Mathf.min(max, value));
  }

  //clamp( x, a, b ) { return ( x < a ) ? a : ( ( x > b ) ? b : x ); },

  distance(p1: f32[], p2: f32[]): f32 {
    var xd = p2[0] - p1[0];
    var yd = p2[1] - p1[1];
    var zd = p2[2] - p1[2];
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

  acosClamp(cos: f32): f32 {
    if (cos > 1) return 0;
    else if (cos < -1) return Mathf.PI;
    else return Mathf.acos(cos);
  }

  distanceVector(v1: Vec3, v2: Vec3): f32 {
    var xd = v1.x - v2.x;
    var yd = v1.y - v2.y;
    var zd = v1.z - v2.z;
    return xd * xd + yd * yd + zd * zd;
  }

  dotVectors(a: Vec3, b: Vec3): f32 {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
}
