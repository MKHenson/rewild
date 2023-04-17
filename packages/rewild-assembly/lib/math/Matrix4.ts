import { EngineVector3 } from "./Vector3";
import { Matrix4 } from "rewild-common";

export class EngineMatrix4 extends Matrix4 {
  constructor() {
    super();
  }

  clone(): EngineMatrix4 {
    return new EngineMatrix4().fromArray(this.elements) as EngineMatrix4;
  }

  copy(m: EngineMatrix4): EngineMatrix4 {
    return super.copy(m) as EngineMatrix4;
  }

  multiplySIMD(m: EngineMatrix4): EngineMatrix4 {
    return this.multiplyMatricesSIMD(this, m);
  }

  premultiplySIMD(m: EngineMatrix4): EngineMatrix4 {
    return this.multiplyMatricesSIMD(m, this);
  }

  multiplyMatricesSIMD(a: EngineMatrix4, b: EngineMatrix4): EngineMatrix4 {
    const ae = a.elements.dataStart;
    const be = b.elements.dataStart;
    const te = this.elements.dataStart;

    const a0 = v128.load(ae, 0); // 0 * 4
    const a1 = v128.load(ae, 16); // 4 * 4
    const a2 = v128.load(ae, 32); // 8 * 4
    const a3 = v128.load(ae, 48); // 8 * 4

    const swiz0000 = v128(0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3);
    const swiz1111 = v128(4, 5, 6, 7, 4, 5, 6, 7, 4, 5, 6, 7, 4, 5, 6, 7);
    const swiz2222 = v128(8, 9, 10, 11, 8, 9, 10, 11, 8, 9, 10, 11, 8, 9, 10, 11);
    const swiz3333 = v128(12, 13, 14, 15, 12, 13, 14, 15, 12, 13, 14, 15, 12, 13, 14, 15);

    const b0 = v128.load(be, 0);
    const out0 = f32x4.add(
      f32x4.mul(v128.swizzle(b0, swiz0000), a0),
      f32x4.add(
        f32x4.mul(v128.swizzle(b0, swiz1111), a1),
        f32x4.add(f32x4.mul(v128.swizzle(b0, swiz2222), a2), f32x4.mul(v128.swizzle(b0, swiz3333), a3))
      )
    );
    v128.store(te, out0, 0);

    const b1 = v128.load(be, 16);
    const out1 = f32x4.add(
      f32x4.mul(v128.swizzle(b1, swiz0000), a0),
      f32x4.add(
        f32x4.mul(v128.swizzle(b1, swiz1111), a1),
        f32x4.add(f32x4.mul(v128.swizzle(b1, swiz2222), a2), f32x4.mul(v128.swizzle(b1, swiz3333), a3))
      )
    );
    v128.store(te, out1, 16);

    const b2 = v128.load(be, 32);
    const out2 = f32x4.add(
      f32x4.mul(v128.swizzle(b2, swiz0000), a0),
      f32x4.add(
        f32x4.mul(v128.swizzle(b2, swiz1111), a1),
        f32x4.add(f32x4.mul(v128.swizzle(b2, swiz2222), a2), f32x4.mul(v128.swizzle(b2, swiz3333), a3))
      )
    );
    v128.store(te, out2, 32);

    const b3 = v128.load(be, 48);
    const out3 = f32x4.add(
      f32x4.mul(v128.swizzle(b3, swiz0000), a0),
      f32x4.add(
        f32x4.mul(v128.swizzle(b3, swiz1111), a1),
        f32x4.add(f32x4.mul(v128.swizzle(b3, swiz2222), a2), f32x4.mul(v128.swizzle(b3, swiz3333), a3))
      )
    );
    v128.store(te, out3, 48);

    return this;
  }

  multiplyScalarSIMD(s: f32): EngineMatrix4 {
    const te = this.elements.dataStart;
    const scalar = f32x4.splat(s);
    const a0 = f32x4.mul(v128.load(te, 0), scalar);
    const a1 = f32x4.mul(v128.load(te, 16), scalar);
    const a2 = f32x4.mul(v128.load(te, 32), scalar);
    const a3 = f32x4.mul(v128.load(te, 48), scalar);
    v128.store(te, a0, 0);
    v128.store(te, a1, 16);
    v128.store(te, a2, 32);
    v128.store(te, a3, 48);
    return this;
  }

  transposeSIMD(): EngineMatrix4 {
    const te = this.elements;
    let a0: v128,
      a1: v128,
      a2: v128,
      a3: v128,
      tmp01: v128,
      tmp23: v128,
      out0: v128,
      out1: v128,
      out2: v128,
      out3: v128;
    const a = te.dataStart;

    a0 = v128.load(a, 0);
    a1 = v128.load(a, 16);
    a2 = v128.load(a, 32);
    a3 = v128.load(a, 48);

    tmp01 = v128.shuffle<f32>(a0, a1, 0, 1, 4, 5);
    tmp23 = v128.shuffle<f32>(a2, a3, 0, 1, 4, 5);
    out0 = v128.shuffle<f32>(tmp01, tmp23, 0, 2, 4, 6);
    out1 = v128.shuffle<f32>(tmp01, tmp23, 1, 3, 5, 7);
    v128.store(a, out0, 0);
    v128.store(a, out1, 16);

    tmp01 = v128.shuffle<f32>(a0, a1, 2, 3, 6, 7);
    tmp23 = v128.shuffle<f32>(a2, a3, 2, 3, 6, 7);
    out2 = v128.shuffle<f32>(tmp01, tmp23, 0, 2, 4, 6);
    out3 = v128.shuffle<f32>(tmp01, tmp23, 1, 3, 5, 7);
    v128.store(a, out2, 32);
    v128.store(a, out3, 48);

    return this;
  }

  invertSIMD(): EngineMatrix4 {
    const a = this.elements.dataStart;
    var row0: v128,
      row1: v128,
      row2: v128,
      row3: v128,
      tmp1: v128,
      minor0: v128,
      minor1: v128,
      minor2: v128,
      minor3: v128,
      det: v128,
      a0 = v128.load(a, 0),
      a1 = v128.load(a, 16),
      a2 = v128.load(a, 32),
      a3 = v128.load(a, 48);

    // Compute matrix adjugate
    tmp1 = v128.shuffle<f32>(a0, a1, 0, 1, 4, 5);
    row1 = v128.shuffle<f32>(a2, a3, 0, 1, 4, 5);
    row0 = v128.shuffle<f32>(tmp1, row1, 0, 2, 4, 6);
    row1 = v128.shuffle<f32>(row1, tmp1, 1, 3, 5, 7);
    tmp1 = v128.shuffle<f32>(a0, a1, 2, 3, 6, 7);
    row3 = v128.shuffle<f32>(a2, a3, 2, 3, 6, 7);
    row2 = v128.shuffle<f32>(tmp1, row3, 0, 2, 4, 6);
    row3 = v128.shuffle<f32>(row3, tmp1, 1, 3, 5, 7);

    const swiz1032 = v128(4, 5, 6, 7, 0, 1, 2, 3, 12, 13, 14, 15, 8, 9, 10, 11); // 1, 0, 3, 2
    const swiz2301 = v128(8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7); // 2, 3, 0, 1

    tmp1 = f32x4.mul(row2, row3);
    tmp1 = v128.swizzle(tmp1, swiz1032); // 1, 0, 3, 2
    minor0 = f32x4.mul(row1, tmp1);
    minor1 = f32x4.mul(row0, tmp1);
    tmp1 = v128.swizzle(tmp1, swiz2301); // 2, 3, 0, 1
    minor0 = f32x4.sub(f32x4.mul(row1, tmp1), minor0);
    minor1 = f32x4.sub(f32x4.mul(row0, tmp1), minor1);
    minor1 = v128.swizzle(minor1, swiz2301); // 2, 3, 0, 1

    tmp1 = f32x4.mul(row1, row2);
    tmp1 = v128.swizzle(tmp1, swiz1032); // 1, 0, 3, 2
    minor0 = f32x4.add(f32x4.mul(row3, tmp1), minor0);
    minor3 = f32x4.mul(row0, tmp1);
    tmp1 = v128.swizzle(tmp1, swiz2301); // 2, 3, 0, 1
    minor0 = f32x4.sub(minor0, f32x4.mul(row3, tmp1));
    minor3 = f32x4.sub(f32x4.mul(row0, tmp1), minor3);
    minor3 = v128.swizzle(minor3, swiz2301); // 2, 3, 0, 1

    tmp1 = f32x4.mul(v128.swizzle(row1, swiz2301), row3);
    tmp1 = v128.swizzle(tmp1, swiz1032); // 1, 0, 3, 2
    row2 = v128.swizzle(row2, swiz2301); // 2, 3, 0, 1
    minor0 = f32x4.add(f32x4.mul(row2, tmp1), minor0);
    minor2 = f32x4.mul(row0, tmp1);
    tmp1 = v128.swizzle(tmp1, swiz2301); // 2, 3, 0, 1
    minor0 = f32x4.sub(minor0, f32x4.mul(row2, tmp1));
    minor2 = f32x4.sub(f32x4.mul(row0, tmp1), minor2);
    minor2 = v128.swizzle(minor2, swiz2301); // 2, 3, 0, 1

    tmp1 = f32x4.mul(row0, row1);
    tmp1 = v128.swizzle(tmp1, swiz1032); // 1, 0, 3, 2
    minor2 = f32x4.add(f32x4.mul(row3, tmp1), minor2);
    minor3 = f32x4.sub(f32x4.mul(row2, tmp1), minor3);
    tmp1 = v128.swizzle(tmp1, swiz2301); // 2, 3, 0, 1
    minor2 = f32x4.sub(f32x4.mul(row3, tmp1), minor2);
    minor3 = f32x4.sub(minor3, f32x4.mul(row2, tmp1));

    tmp1 = f32x4.mul(row0, row3);
    tmp1 = v128.swizzle(tmp1, swiz1032); // 1, 0, 3, 2
    minor1 = f32x4.sub(minor1, f32x4.mul(row2, tmp1));
    minor2 = f32x4.add(f32x4.mul(row1, tmp1), minor2);
    tmp1 = v128.swizzle(tmp1, swiz2301); // 2, 3, 0, 1
    minor1 = f32x4.add(f32x4.mul(row2, tmp1), minor1);
    minor2 = f32x4.sub(minor2, f32x4.mul(row1, tmp1));

    tmp1 = f32x4.mul(row0, row2);
    tmp1 = v128.swizzle(tmp1, swiz1032); // 1, 0, 3, 2
    minor1 = f32x4.add(f32x4.mul(row3, tmp1), minor1);
    minor3 = f32x4.sub(minor3, f32x4.mul(row1, tmp1));
    tmp1 = v128.swizzle(tmp1, swiz2301); // 2, 3, 0, 1
    minor1 = f32x4.sub(minor1, f32x4.mul(row3, tmp1));
    minor3 = f32x4.add(f32x4.mul(row1, tmp1), minor3);

    // Compute matrix determinant
    det = f32x4.mul(row0, minor0);
    det = f32x4.add(v128.swizzle(det, swiz2301), det); // 2, 3, 0, 1
    det = f32x4.add(v128.swizzle(det, swiz1032), det); // 1, 0, 3, 2

    tmp1 = f32x4.div(f32x4.splat(1), det); // reciprocalApproximation

    det = f32x4.sub(f32x4.add(tmp1, tmp1), f32x4.mul(det, f32x4.mul(tmp1, tmp1)));
    det = v128.swizzle(det, v128(0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3)); // 0 0 0 0
    if (!det) {
      return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) as EngineMatrix4;
    }

    // Compute matrix inverse
    v128.store(a, f32x4.mul(det, minor0), 0);
    v128.store(a, f32x4.mul(det, minor1), 16);
    v128.store(a, f32x4.mul(det, minor2), 32);
    v128.store(a, f32x4.mul(det, minor3), 48);
    return this;
  }

  scaleSIMD(v: EngineVector3): EngineMatrix4 {
    const swizXXXX = v128(0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3);
    const swizYYYY = v128(4, 5, 6, 7, 4, 5, 6, 7, 4, 5, 6, 7, 4, 5, 6, 7);
    const swizZZZZ = v128(8, 9, 10, 11, 8, 9, 10, 11, 8, 9, 10, 11, 8, 9, 10, 11);

    const te = this.elements.dataStart;
    const vec = f32x4(v.x, v.y, v.z, 0);
    const a0 = f32x4.mul(v128.load(te, 0), v128.swizzle(vec, swizXXXX));
    const a1 = f32x4.mul(v128.load(te, 16), v128.swizzle(vec, swizYYYY));
    const a2 = f32x4.mul(v128.load(te, 32), v128.swizzle(vec, swizZZZZ));

    v128.store(te, a0, 0);
    v128.store(te, a1, 16);
    v128.store(te, a2, 32);
    return this;
  }
}
