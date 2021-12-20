import * as MathUtils from "./MathUtils";

export class Colors {
  static aliceblue: i32 = 0xf0f8ff;
  static antiquewhite: i32 = 0xfaebd7;
  static aqua: i32 = 0x00ffff;
  static aquamarine: i32 = 0x7fffd4;
  static azure: i32 = 0xf0ffff;
  static beige: i32 = 0xf5f5dc;
  static bisque: i32 = 0xffe4c4;
  static black: i32 = 0x000000;
  static blanchedalmond: i32 = 0xffebcd;
  static blue: i32 = 0x0000ff;
  static blueviolet: i32 = 0x8a2be2;
  static brown: i32 = 0xa52a2a;
  static burlywood: i32 = 0xdeb887;
  static cadetblue: i32 = 0x5f9ea0;
  static chartreuse: i32 = 0x7fff00;
  static chocolate: i32 = 0xd2691e;
  static coral: i32 = 0xff7f50;
  static cornflowerblue: i32 = 0x6495ed;
  static cornsilk: i32 = 0xfff8dc;
  static crimson: i32 = 0xdc143c;
  static cyan: i32 = 0x00ffff;
  static darkblue: i32 = 0x00008b;
  static darkcyan: i32 = 0x008b8b;
  static darkgoldenrod: i32 = 0xb8860b;
  static darkgray: i32 = 0xa9a9a9;
  static darkgreen: i32 = 0x006400;
  static darkgrey: i32 = 0xa9a9a9;
  static darkkhaki: i32 = 0xbdb76b;
  static darkmagenta: i32 = 0x8b008b;
  static darkolivegreen: i32 = 0x556b2f;
  static darkorange: i32 = 0xff8c00;
  static darkorchid: i32 = 0x9932cc;
  static darkred: i32 = 0x8b0000;
  static darksalmon: i32 = 0xe9967a;
  static darkseagreen: i32 = 0x8fbc8f;
  static darkslateblue: i32 = 0x483d8b;
  static darkslategray: i32 = 0x2f4f4f;
  static darkslategrey: i32 = 0x2f4f4f;
  static darkturquoise: i32 = 0x00ced1;
  static darkviolet: i32 = 0x9400d3;
  static deeppink: i32 = 0xff1493;
  static deepskyblue: i32 = 0x00bfff;
  static dimgray: i32 = 0x696969;
  static dimgrey: i32 = 0x696969;
  static dodgerblue: i32 = 0x1e90ff;
  static firebrick: i32 = 0xb22222;
  static floralwhite: i32 = 0xfffaf0;
  static forestgreen: i32 = 0x228b22;
  static fuchsia: i32 = 0xff00ff;
  static gainsboro: i32 = 0xdcdcdc;
  static ghostwhite: i32 = 0xf8f8ff;
  static gold: i32 = 0xffd700;
  static goldenrod: i32 = 0xdaa520;
  static gray: i32 = 0x808080;
  static green: i32 = 0x008000;
  static greenyellow: i32 = 0xadff2f;
  static grey: i32 = 0x808080;
  static honeydew: i32 = 0xf0fff0;
  static hotpink: i32 = 0xff69b4;
  static indianred: i32 = 0xcd5c5c;
  static indigo: i32 = 0x4b0082;
  static ivory: i32 = 0xfffff0;
  static khaki: i32 = 0xf0e68c;
  static lavender: i32 = 0xe6e6fa;
  static lavenderblush: i32 = 0xfff0f5;
  static lawngreen: i32 = 0x7cfc00;
  static lemonchiffon: i32 = 0xfffacd;
  static lightblue: i32 = 0xadd8e6;
  static lightcoral: i32 = 0xf08080;
  static lightcyan: i32 = 0xe0ffff;
  static lightgoldenrodyellow: i32 = 0xfafad2;
  static lightgray: i32 = 0xd3d3d3;
  static lightgreen: i32 = 0x90ee90;
  static lightgrey: i32 = 0xd3d3d3;
  static lightpink: i32 = 0xffb6c1;
  static lightsalmon: i32 = 0xffa07a;
  static lightseagreen: i32 = 0x20b2aa;
  static lightskyblue: i32 = 0x87cefa;
  static lightslategray: i32 = 0x778899;
  static lightslategrey: i32 = 0x778899;
  static lightsteelblue: i32 = 0xb0c4de;
  static lightyellow: i32 = 0xffffe0;
  static lime: i32 = 0x00ff00;
  static limegreen: i32 = 0x32cd32;
  static linen: i32 = 0xfaf0e6;
  static magenta: i32 = 0xff00ff;
  static maroon: i32 = 0x800000;
  static mediumaquamarine: i32 = 0x66cdaa;
  static mediumblue: i32 = 0x0000cd;
  static mediumorchid: i32 = 0xba55d3;
  static mediumpurple: i32 = 0x9370db;
  static mediumseagreen: i32 = 0x3cb371;
  static mediumslateblue: i32 = 0x7b68ee;
  static mediumspringgreen: i32 = 0x00fa9a;
  static mediumturquoise: i32 = 0x48d1cc;
  static mediumvioletred: i32 = 0xc71585;
  static midnightblue: i32 = 0x191970;
  static mintcream: i32 = 0xf5fffa;
  static mistyrose: i32 = 0xffe4e1;
  static moccasin: i32 = 0xffe4b5;
  static navajowhite: i32 = 0xffdead;
  static navy: i32 = 0x000080;
  static oldlace: i32 = 0xfdf5e6;
  static olive: i32 = 0x808000;
  static olivedrab: i32 = 0x6b8e23;
  static orange: i32 = 0xffa500;
  static orangered: i32 = 0xff4500;
  static orchid: i32 = 0xda70d6;
  static palegoldenrod: i32 = 0xeee8aa;
  static palegreen: i32 = 0x98fb98;
  static paleturquoise: i32 = 0xafeeee;
  static palevioletred: i32 = 0xdb7093;
  static papayawhip: i32 = 0xffefd5;
  static peachpuff: i32 = 0xffdab9;
  static peru: i32 = 0xcd853f;
  static pink: i32 = 0xffc0cb;
  static plum: i32 = 0xdda0dd;
  static powderblue: i32 = 0xb0e0e6;
  static purple: i32 = 0x800080;
  static rebeccapurple: i32 = 0x663399;
  static red: i32 = 0xff0000;
  static rosybrown: i32 = 0xbc8f8f;
  static royalblue: i32 = 0x4169e1;
  static saddlebrown: i32 = 0x8b4513;
  static salmon: i32 = 0xfa8072;
  static sandybrown: i32 = 0xf4a460;
  static seagreen: i32 = 0x2e8b57;
  static seashell: i32 = 0xfff5ee;
  static sienna: i32 = 0xa0522d;
  static silver: i32 = 0xc0c0c0;
  static skyblue: i32 = 0x87ceeb;
  static slateblue: i32 = 0x6a5acd;
  static slategray: i32 = 0x708090;
  static slategrey: i32 = 0x708090;
  static snow: i32 = 0xfffafa;
  static springgreen: i32 = 0x00ff7f;
  static steelblue: i32 = 0x4682b4;
  static tan: i32 = 0xd2b48c;
  static teal: i32 = 0x008080;
  static thistle: i32 = 0xd8bfd8;
  static tomato: i32 = 0xff6347;
  static turquoise: i32 = 0x40e0d0;
  static violet: i32 = 0xee82ee;
  static wheat: i32 = 0xf5deb3;
  static white: i32 = 0xffffff;
  static whitesmoke: i32 = 0xf5f5f5;
  static yellow: i32 = 0xffff00;
  static yellowgreen: i32 = 0x9acd32;
}
export class HSL {
  h: f32 = 0;
  s: f32 = 0;
  l: f32 = 0;
}

const _hslA: HSL = new HSL();
const _hslB: HSL = new HSL();

function hue2rgb(p: f32, q: f32, t: f32): f32 {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}

function SRGBToLinear(c: f32): f32 {
  return c < 0.04045 ? c * 0.0773993808 : Mathf.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

function LinearToSRGB(c: f32): f32 {
  return c < 0.0031308 ? c * 12.92 : 1.055 * Mathf.pow(c, 0.41666) - 0.055;
}

export class Color {
  r: f32;
  b: f32;
  g: f32;

  constructor(r: f32 = 1, g: f32 = 1, b: f32 = 1) {
    this.setRGB(r, g, b);
  }

  setFromColor(value: Color): Color {
    this.copy(value);
    return this;
  }

  setFromF32(value: f32): Color {
    this.setHex(value);
    return this;
  }

  // TODO: As doesnt support regex yet
  //   setFromString(value: string) {
  //     this.setStyle(value);
  //     return this;
  //   }

  setScalar(scalar: f32): Color {
    this.r = scalar;
    this.g = scalar;
    this.b = scalar;

    return this;
  }

  setHex(hex: f32): Color {
    hex = Mathf.floor(hex);

    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;

    return this;
  }

  setRGB(r: f32, g: f32, b: f32): Color {
    this.r = r;
    this.g = g;
    this.b = b;

    return this;
  }

  setHSL(h: f32, s: f32, l: f32): Color {
    // h,s,l ranges are in 0.0 - 1.0
    h = MathUtils.euclideanModulo(h, 1);
    s = MathUtils.clamp(s, 0, 1);
    l = MathUtils.clamp(l, 0, 1);

    if (s === 0) {
      this.r = this.g = this.b = l;
    } else {
      const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
      const q = 2 * l - p;

      this.r = hue2rgb(q, p, h + 1 / 3);
      this.g = hue2rgb(q, p, h);
      this.b = hue2rgb(q, p, h - 1 / 3);
    }

    return this;
  }

  // TODO: regex is not in AS yet
  //   setStyle(style: string) {
  //     function handleAlpha(string: string) {
  //       if (parseFloat(string) < 1) {
  //         console.warn(
  //           "THREE.Color: Alpha component of " + style + " will be ignored."
  //         );
  //       }
  //     }

  //     let m;

  //     if ((m = /^((?:rgb|hsl)a?)\(([^\)]*)\)/.exec(style))) {
  //       // rgb / hsl

  //       let color;
  //       const name = m[1];
  //       const components = m[2];

  //       switch (name) {
  //         case "rgb":
  //         case "rgba":
  //           if (
  //             (color =
  //               /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(
  //                 components
  //               ))
  //           ) {
  //             // rgb(255,0,0) rgba(255,0,0,0.5)
  //             this.r = Mathf.min(255, parseInt(color[1], 10)) / 255;
  //             this.g = Mathf.min(255, parseInt(color[2], 10)) / 255;
  //             this.b = Mathf.min(255, parseInt(color[3], 10)) / 255;

  //             handleAlpha(color[4]);

  //             return this;
  //           }

  //           if (
  //             (color =
  //               /^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(
  //                 components
  //               ))
  //           ) {
  //             // rgb(100%,0%,0%) rgba(100%,0%,0%,0.5)
  //             this.r = Mathf.min(100, parseInt(color[1], 10)) / 100;
  //             this.g = Mathf.min(100, parseInt(color[2], 10)) / 100;
  //             this.b = Mathf.min(100, parseInt(color[3], 10)) / 100;

  //             handleAlpha(color[4]);

  //             return this;
  //           }

  //           break;

  //         case "hsl":
  //         case "hsla":
  //           if (
  //             (color =
  //               /^\s*(\d*\.?\d+)\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(
  //                 components
  //               ))
  //           ) {
  //             // hsl(120,50%,50%) hsla(120,50%,50%,0.5)
  //             const h = parseFloat(color[1]) / 360;
  //             const s = parseInt(color[2], 10) / 100;
  //             const l = parseInt(color[3], 10) / 100;

  //             handleAlpha(color[4]);

  //             return this.setHSL(h, s, l);
  //           }

  //           break;
  //       }
  //     } else if ((m = /^\#([A-Fa-f\d]+)$/.exec(style))) {
  //       // hex color

  //       const hex = m[1];
  //       const size = hex.length;

  //       if (size === 3) {
  //         // #ff0
  //         this.r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
  //         this.g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
  //         this.b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;

  //         return this;
  //       } else if (size === 6) {
  //         // #ff0000
  //         this.r = parseInt(hex.charAt(0) + hex.charAt(1), 16) / 255;
  //         this.g = parseInt(hex.charAt(2) + hex.charAt(3), 16) / 255;
  //         this.b = parseInt(hex.charAt(4) + hex.charAt(5), 16) / 255;

  //         return this;
  //       }
  //     }

  //     if (style && style.length > 0) {
  //       return this.setColorName(style);
  //     }

  //     return this;
  //   }

  // setColorName(style: string): Color {
  //   // color keywords
  //   const hex: u32 = Colors[style.toLowerCase()];

  //   if (hex !== undefined) {
  //     // red
  //     this.setHex(hex);
  //   } else {
  //     // unknown color
  //     console.warn("THREE.Color: Unknown color " + style);
  //   }

  //   return this;
  // }

  clone(): Color {
    return new Color(this.r, this.g, this.b);
  }

  copy(color: Color): Color {
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;

    return this;
  }

  copyGammaToLinear(color: Color, gammaFactor: f32 = 2.0): Color {
    this.r = Mathf.pow(color.r, gammaFactor);
    this.g = Mathf.pow(color.g, gammaFactor);
    this.b = Mathf.pow(color.b, gammaFactor);

    return this;
  }

  copyLinearToGamma(color: Color, gammaFactor: f32 = 2.0): Color {
    const safeInverse: f32 = gammaFactor > 0 ? 1.0 / gammaFactor : 1.0;

    this.r = Mathf.pow(color.r, safeInverse);
    this.g = Mathf.pow(color.g, safeInverse);
    this.b = Mathf.pow(color.b, safeInverse);

    return this;
  }

  convertGammaToLinear(gammaFactor: f32): Color {
    this.copyGammaToLinear(this, gammaFactor);

    return this;
  }

  convertLinearToGamma(gammaFactor: f32): Color {
    this.copyLinearToGamma(this, gammaFactor);

    return this;
  }

  copySRGBToLinear(color: Color): Color {
    this.r = SRGBToLinear(color.r);
    this.g = SRGBToLinear(color.g);
    this.b = SRGBToLinear(color.b);

    return this;
  }

  copyLinearToSRGB(color: Color): Color {
    this.r = LinearToSRGB(color.r);
    this.g = LinearToSRGB(color.g);
    this.b = LinearToSRGB(color.b);

    return this;
  }

  convertSRGBToLinear(): Color {
    this.copySRGBToLinear(this);

    return this;
  }

  convertLinearToSRGB(): Color {
    this.copyLinearToSRGB(this);

    return this;
  }

  getHex(): i32 {
    return ((this.r * 255) << 16) ^ ((this.g * 255) << 8) ^ ((this.b * 255) << 0);
  }

  getHexString(): string {
    return ("000000" + this.getHex().toString(16)).slice(-6);
  }

  getHSL(target: HSL): HSL {
    // h,s,l ranges are in 0.0 - 1.0
    const r: f32 = this.r,
      g: f32 = this.g,
      b: f32 = this.b;

    let max: f32 = Mathf.max(r, g);
    max = Mathf.max(max, b);
    let min: f32 = Mathf.min(r, g);
    min = Mathf.min(min, b);

    let hue!: f32, saturation: f32;
    const lightness: f32 = (min + max) / 2.0;

    if (min === max) {
      hue = 0;
      saturation = 0;
    } else {
      const delta = max - min;

      saturation = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);

      switch (max) {
        case r:
          hue = (g - b) / delta + (g < b ? 6 : 0);
          break;
        case g:
          hue = (b - r) / delta + 2;
          break;
        case b:
          hue = (r - g) / delta + 4;
          break;
      }

      hue /= 6;
    }

    target.h = hue;
    target.s = saturation;
    target.l = lightness;

    return target;
  }

  getStyle(): string {
    return "rgb(" + ((this.r * 255) | 0) + "," + ((this.g * 255) | 0) + "," + ((this.b * 255) | 0) + ")";
  }

  offsetHSL(h: f32, s: f32, l: f32): Color {
    this.getHSL(_hslA);

    _hslA.h += h;
    _hslA.s += s;
    _hslA.l += l;

    this.setHSL(_hslA.h, _hslA.s, _hslA.l);

    return this;
  }

  add(color: Color): Color {
    this.r += color.r;
    this.g += color.g;
    this.b += color.b;

    return this;
  }

  addColors(color1: Color, color2: Color): Color {
    this.r = color1.r + color2.r;
    this.g = color1.g + color2.g;
    this.b = color1.b + color2.b;

    return this;
  }

  addScalar(s: f32): Color {
    this.r += s;
    this.g += s;
    this.b += s;

    return this;
  }

  sub(color: Color): Color {
    this.r = Mathf.max(0, this.r - color.r);
    this.g = Mathf.max(0, this.g - color.g);
    this.b = Mathf.max(0, this.b - color.b);

    return this;
  }

  multiply(color: Color): Color {
    this.r *= color.r;
    this.g *= color.g;
    this.b *= color.b;

    return this;
  }

  multiplyScalar(s: f32): Color {
    this.r *= s;
    this.g *= s;
    this.b *= s;

    return this;
  }

  lerp(color: Color, alpha: f32): Color {
    this.r += (color.r - this.r) * alpha;
    this.g += (color.g - this.g) * alpha;
    this.b += (color.b - this.b) * alpha;

    return this;
  }

  lerpColors(color1: Color, color2: Color, alpha: f32): Color {
    this.r = color1.r + (color2.r - color1.r) * alpha;
    this.g = color1.g + (color2.g - color1.g) * alpha;
    this.b = color1.b + (color2.b - color1.b) * alpha;

    return this;
  }

  lerpHSL(color: Color, alpha: f32): Color {
    this.getHSL(_hslA);
    color.getHSL(_hslB);

    const h = MathUtils.lerp(_hslA.h, _hslB.h, alpha);
    const s = MathUtils.lerp(_hslA.s, _hslB.s, alpha);
    const l = MathUtils.lerp(_hslA.l, _hslB.l, alpha);

    this.setHSL(h, s, l);

    return this;
  }

  equals(c: Color): boolean {
    return c.r === this.r && c.g === this.g && c.b === this.b;
  }

  fromArray(array: f32[], offset: u32 = 0): Color {
    this.r = array[offset];
    this.g = array[offset + 1];
    this.b = array[offset + 2];

    return this;
  }

  fromF32Array(array: Float32Array, offset: u32 = 0): Color {
    this.r = array[offset];
    this.g = array[offset + 1];
    this.b = array[offset + 2];

    return this;
  }

  toArray(array: f32[] = [], offset: u32 = 0): f32[] {
    array[offset] = this.r;
    array[offset + 1] = this.g;
    array[offset + 2] = this.b;

    return array;
  }

  toF32Array(array: Float32Array, offset: u32 = 0): Float32Array {
    array[offset] = this.r;
    array[offset + 1] = this.g;
    array[offset + 2] = this.b;

    return array;
  }

  // TODO:
  //   fromBufferAttribute(attribute, index) {
  //     this.r = attribute.getX(index);
  //     this.g = attribute.getY(index);
  //     this.b = attribute.getZ(index);

  //     if (attribute.normalized === true) {
  //       // assuming Uint8Array

  //       this.r /= 255;
  //       this.g /= 255;
  //       this.b /= 255;
  //     }

  //     return this;
  //   }

  // toJSON(): i32 {
  //   return this.getHex();
  // }
}
