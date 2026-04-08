import { Matrix3 } from './Matrix3';
import { Matrix4 } from './Matrix4';

function matrixEquals3(b: Matrix3, a: Matrix3, tolerance?: number): boolean {
  tolerance = tolerance || 0.0001;
  if (a.elements.length != b.elements.length) {
    return false;
  }

  for (let i = 0, il = a.elements.length; i < il; i++) {
    const delta = Math.abs(a.elements[i] - b.elements[i]);
    if (delta > tolerance) {
      return false;
    }
  }

  return true;
}

function toMatrix4(m3: Matrix3): Matrix4 {
  const result = new Matrix4();
  const re = result.elements;
  const me = m3.elements;
  re[0] = me[0];
  re[1] = me[1];
  re[2] = me[2];
  re[4] = me[4];
  re[5] = me[5];
  re[6] = me[6];
  re[8] = me[8];
  re[9] = me[9];
  re[10] = me[10];

  return result;
}

describe('Matrix3', () => {
  // INSTANCING
  test('Instancing', () => {
    const a = new Matrix3();
    expect(a.determinant() == 1).toBeTruthy();

    // Rewild Matrix3 uses padded layout: indices 0,1,2, 4,5,6, 8,9,10
    const b = new Matrix3().set(0, 1, 2, 3, 4, 5, 6, 7, 8);
    expect(b.elements[0] == 0).toBeTruthy();
    expect(b.elements[1] == 3).toBeTruthy();
    expect(b.elements[2] == 6).toBeTruthy();
    expect(b.elements[4] == 1).toBeTruthy();
    expect(b.elements[5] == 4).toBeTruthy();
    expect(b.elements[6] == 7).toBeTruthy();
    expect(b.elements[8] == 2).toBeTruthy();
    expect(b.elements[9] == 5).toBeTruthy();
    expect(b.elements[10] == 8).toBeTruthy();

    expect(!matrixEquals3(a, b)).toBeTruthy();

    // Constructor with args not supported in rewild - use set() instead
  });

  // PUBLIC STUFF
  test('isMatrix3', () => {
    const a = new Matrix3();
    expect(a.isMatrix3 === true).toBeTruthy();

    const b = new Matrix4();
    expect(!(b as any).isMatrix3).toBeTruthy();
  });

  test('set', () => {
    const b = new Matrix3();
    expect(b.determinant() == 1).toBeTruthy();

    b.set(0, 1, 2, 3, 4, 5, 6, 7, 8);
    expect(b.elements[0] == 0).toBeTruthy();
    expect(b.elements[1] == 3).toBeTruthy();
    expect(b.elements[2] == 6).toBeTruthy();
    expect(b.elements[4] == 1).toBeTruthy();
    expect(b.elements[5] == 4).toBeTruthy();
    expect(b.elements[6] == 7).toBeTruthy();
    expect(b.elements[8] == 2).toBeTruthy();
    expect(b.elements[9] == 5).toBeTruthy();
    expect(b.elements[10] == 8).toBeTruthy();
  });

  test('identity', () => {
    const b = new Matrix3().set(0, 1, 2, 3, 4, 5, 6, 7, 8);
    expect(b.elements[0] == 0).toBeTruthy();
    expect(b.elements[1] == 3).toBeTruthy();
    expect(b.elements[2] == 6).toBeTruthy();
    expect(b.elements[4] == 1).toBeTruthy();
    expect(b.elements[5] == 4).toBeTruthy();
    expect(b.elements[6] == 7).toBeTruthy();
    expect(b.elements[8] == 2).toBeTruthy();
    expect(b.elements[9] == 5).toBeTruthy();
    expect(b.elements[10] == 8).toBeTruthy();

    const a = new Matrix3();
    expect(!matrixEquals3(a, b)).toBeTruthy();

    b.identity();
    expect(matrixEquals3(a, b)).toBeTruthy();
  });

  test('clone', () => {
    const a = new Matrix3().set(0, 1, 2, 3, 4, 5, 6, 7, 8);
    const b = a.clone();

    expect(matrixEquals3(a, b)).toBeTruthy();

    // ensure that it is a true copy
    a.elements[0] = 2;
    expect(!matrixEquals3(a, b)).toBeTruthy();
  });

  test('copy', () => {
    const a = new Matrix3().set(0, 1, 2, 3, 4, 5, 6, 7, 8);
    const b = new Matrix3().copy(a);

    expect(matrixEquals3(a, b)).toBeTruthy();

    // ensure that it is a true copy
    a.elements[0] = 2;
    expect(!matrixEquals3(a, b)).toBeTruthy();
  });

  test('setFromMatrix4', () => {
    const a = new Matrix4().set(
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    );
    const b = new Matrix3();
    const c = new Matrix3().set(0, 1, 2, 4, 5, 6, 8, 9, 10);
    b.setFromMatrix4(a);
    expect(b.equals(c)).toBeTruthy();
  });

  test('multiply/premultiply', () => {
    // both simply just wrap multiplyMatrices
    const a = new Matrix3().set(2, 3, 5, 7, 11, 13, 17, 19, 23);
    const b = new Matrix3().set(29, 31, 37, 41, 43, 47, 53, 59, 61);

    a.multiply(b);
    // Check individual meaningful elements in the padded layout
    expect(a.elements[0]).toBe(446);
    expect(a.elements[1]).toBe(1343);
    expect(a.elements[2]).toBe(2491);
    expect(a.elements[4]).toBe(486);
    expect(a.elements[5]).toBe(1457);
    expect(a.elements[6]).toBe(2701);
    expect(a.elements[8]).toBe(520);
    expect(a.elements[9]).toBe(1569);
    expect(a.elements[10]).toBe(2925);

    a.set(2, 3, 5, 7, 11, 13, 17, 19, 23);
    a.premultiply(b);
    expect(a.elements[0]).toBe(904);
    expect(a.elements[1]).toBe(1182);
    expect(a.elements[2]).toBe(1556);
    expect(a.elements[4]).toBe(1131);
    expect(a.elements[5]).toBe(1489);
    expect(a.elements[6]).toBe(1967);
    expect(a.elements[8]).toBe(1399);
    expect(a.elements[9]).toBe(1845);
    expect(a.elements[10]).toBe(2435);
  });

  test('multiplyMatrices', () => {
    const lhs = new Matrix3().set(2, 3, 5, 7, 11, 13, 17, 19, 23);
    const rhs = new Matrix3().set(29, 31, 37, 41, 43, 47, 53, 59, 61);
    const ans = new Matrix3();

    ans.multiplyMatrices(lhs, rhs);

    expect(ans.elements[0]).toBe(446);
    expect(ans.elements[1]).toBe(1343);
    expect(ans.elements[2]).toBe(2491);
    expect(ans.elements[4]).toBe(486);
    expect(ans.elements[5]).toBe(1457);
    expect(ans.elements[6]).toBe(2701);
    expect(ans.elements[8]).toBe(520);
    expect(ans.elements[9]).toBe(1569);
    expect(ans.elements[10]).toBe(2925);
  });

  test('multiplyScalar', () => {
    const b = new Matrix3().set(0, 1, 2, 3, 4, 5, 6, 7, 8);
    expect(b.elements[0] == 0).toBeTruthy();
    expect(b.elements[1] == 3).toBeTruthy();
    expect(b.elements[2] == 6).toBeTruthy();
    expect(b.elements[4] == 1).toBeTruthy();
    expect(b.elements[5] == 4).toBeTruthy();
    expect(b.elements[6] == 7).toBeTruthy();
    expect(b.elements[8] == 2).toBeTruthy();
    expect(b.elements[9] == 5).toBeTruthy();
    expect(b.elements[10] == 8).toBeTruthy();

    b.multiplyScalar(2);
    expect(b.elements[0] == 0 * 2).toBeTruthy();
    expect(b.elements[1] == 3 * 2).toBeTruthy();
    expect(b.elements[2] == 6 * 2).toBeTruthy();
    expect(b.elements[4] == 1 * 2).toBeTruthy();
    expect(b.elements[5] == 4 * 2).toBeTruthy();
    expect(b.elements[6] == 7 * 2).toBeTruthy();
    expect(b.elements[8] == 2 * 2).toBeTruthy();
    expect(b.elements[9] == 5 * 2).toBeTruthy();
    expect(b.elements[10] == 8 * 2).toBeTruthy();
  });

  test('determinant', () => {
    const a = new Matrix3();
    expect(a.determinant() == 1).toBeTruthy();

    a.elements[0] = 2;
    expect(a.determinant() == 2).toBeTruthy();

    a.elements[0] = 0;
    expect(a.determinant() == 0).toBeTruthy();

    // calculated via http://www.euclideanspace.com/maths/algebra/matrix/functions/determinant/threeD/index.htm
    a.set(2, 3, 4, 5, 13, 7, 8, 9, 11);
    expect(a.determinant() == -73).toBeTruthy();
  });

  test('invert', () => {
    const zero = new Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const identity4 = new Matrix4();
    const a = new Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const b = new Matrix3();

    b.copy(a).invert();
    expect(matrixEquals3(b, zero)).toBeTruthy();

    const testMatrices = [
      new Matrix4().makeRotationX(0.3),
      new Matrix4().makeRotationX(-0.3),
      new Matrix4().makeRotationY(0.3),
      new Matrix4().makeRotationY(-0.3),
      new Matrix4().makeRotationZ(0.3),
      new Matrix4().makeRotationZ(-0.3),
      new Matrix4().makeScale(1, 2, 3),
      new Matrix4().makeScale(1 / 8, 1 / 2, 1 / 3),
    ];

    for (let i = 0, il = testMatrices.length; i < il; i++) {
      const m = testMatrices[i];

      a.setFromMatrix4(m);
      const mInverse3 = b.copy(a).invert();

      const mInverse = toMatrix4(mInverse3);

      // the determinant of the inverse should be the reciprocal
      expect(
        Math.abs(a.determinant() * mInverse3.determinant() - 1) < 0.0001
      ).toBeTruthy();
      expect(
        Math.abs(m.determinant() * mInverse.determinant() - 1) < 0.0001
      ).toBeTruthy();

      const mProduct = new Matrix4().multiplyMatrices(m, mInverse);
      expect(Math.abs(mProduct.determinant() - 1) < 0.0001).toBeTruthy();
      expect(matrixEquals3(mProduct as any, identity4 as any)).toBeTruthy();
    }
  });

  test('transpose', () => {
    const a = new Matrix3();
    let b = a.clone().transpose();
    expect(matrixEquals3(a, b)).toBeTruthy();

    b = new Matrix3().set(0, 1, 2, 3, 4, 5, 6, 7, 8);
    const c = b.clone().transpose();
    expect(!matrixEquals3(b, c)).toBeTruthy();
    c.transpose();
    expect(matrixEquals3(b, c)).toBeTruthy();
  });

  test('getNormalMatrix', () => {
    const a = new Matrix3();
    const b = new Matrix4().set(
      2,
      3,
      5,
      7,
      11,
      13,
      17,
      19,
      23,
      29,
      31,
      37,
      41,
      43,
      47,
      57
    );
    const expected = new Matrix3().set(
      -1.2857142857142856,
      0.7142857142857143,
      0.2857142857142857,
      0.7428571428571429,
      -0.7571428571428571,
      0.15714285714285714,
      -0.19999999999999998,
      0.3,
      -0.09999999999999999
    );

    a.getNormalMatrix(b);
    expect(matrixEquals3(a, expected)).toBeTruthy();
  });

  test('transposeIntoArray', () => {
    const a = new Matrix3().set(0, 1, 2, 3, 4, 5, 6, 7, 8);
    const b: number[] = [];
    a.transposeIntoArray(b);

    // Rewild transposeIntoArray writes to padded indices: 0,1,2, 4,5,6, 8,9,10
    expect(b[0]).toBe(0);
    expect(b[1]).toBe(1);
    expect(b[2]).toBe(2);
    expect(b[4]).toBe(3);
    expect(b[5]).toBe(4);
    expect(b[6]).toBe(5);
    expect(b[8]).toBe(6);
    expect(b[9]).toBe(7);
    expect(b[10]).toBe(8);
  });

  test('setUvTransform', () => {
    const a = new Matrix3().set(
      0.1767766952966369,
      0.17677669529663687,
      0.32322330470336313,
      -0.17677669529663687,
      0.1767766952966369,
      0.5,
      0,
      0,
      1
    );
    const b = new Matrix3();
    const params = {
      centerX: 0.5,
      centerY: 0.5,
      offsetX: 0,
      offsetY: 0,
      repeatX: 0.25,
      repeatY: 0.25,
      rotation: 0.7753981633974483,
    };
    const expected = new Matrix3().set(
      0.1785355940258599,
      0.17500011904519763,
      0.32323214346447127,
      -0.17500011904519763,
      0.1785355940258599,
      0.4982322625096689,
      0,
      0,
      1
    );

    a.setUvTransform(
      params.offsetX,
      params.offsetY,
      params.repeatX,
      params.repeatY,
      params.rotation,
      params.centerX,
      params.centerY
    );

    b.identity()
      .translate(-params.centerX, -params.centerY)
      .rotate(params.rotation)
      .scale(params.repeatX, params.repeatY)
      .translate(params.centerX, params.centerY)
      .translate(params.offsetX, params.offsetY);

    expect(matrixEquals3(a, expected)).toBeTruthy();
    expect(matrixEquals3(b, expected)).toBeTruthy();
  });

  test('scale', () => {
    const a = new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const expected = new Matrix3().set(0.25, 0.5, 0.75, 1, 1.25, 1.5, 7, 8, 9);

    a.scale(0.25, 0.25);
    expect(matrixEquals3(a, expected)).toBeTruthy();
  });

  test('rotate', () => {
    const a = new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const expected = new Matrix3().set(
      3.5355339059327373,
      4.949747468305833,
      6.363961030678928,
      2.121320343559643,
      2.121320343559643,
      2.1213203435596433,
      7,
      8,
      9
    );

    a.rotate(Math.PI / 4);
    expect(matrixEquals3(a, expected)).toBeTruthy();
  });

  test('translate', () => {
    const a = new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const expected = new Matrix3().set(22, 26, 30, 53, 61, 69, 7, 8, 9);

    a.translate(3, 7);
    expect(matrixEquals3(a, expected)).toBeTruthy();
  });

  // makeTranslation test removed - method does not exist on rewild Matrix3

  test('equals', () => {
    const a = new Matrix3().set(0, 1, 2, 3, 4, 5, 6, 7, 8);
    const b = new Matrix3().set(0, -1, 2, 3, 4, 5, 6, 7, 8);

    expect(!a.equals(b)).toBeTruthy();
    expect(!b.equals(a)).toBeTruthy();

    a.copy(b);
    expect(a.equals(b)).toBeTruthy();
    expect(b.equals(a)).toBeTruthy();
  });

  test('fromArray', () => {
    // Rewild Matrix3.fromArray takes Float32Array and copies all 12 elements (including padding)
    let b = new Matrix3();
    b.fromArray(new Float32Array([0, 3, 6, 0, 1, 4, 7, 0, 2, 5, 8, 0]));

    expect(b.elements[0]).toBe(0);
    expect(b.elements[1]).toBe(3);
    expect(b.elements[2]).toBe(6);
    expect(b.elements[4]).toBe(1);
    expect(b.elements[5]).toBe(4);
    expect(b.elements[6]).toBe(7);
    expect(b.elements[8]).toBe(2);
    expect(b.elements[9]).toBe(5);
    expect(b.elements[10]).toBe(8);

    b = new Matrix3();
    const data = new Float32Array(22);
    data.set([10, 11, 12, 0, 13, 14, 15, 0, 16, 17, 18, 0], 10);
    b.fromArray(data, 10);

    expect(b.elements[0]).toBe(10);
    expect(b.elements[1]).toBe(11);
    expect(b.elements[2]).toBe(12);
    expect(b.elements[4]).toBe(13);
    expect(b.elements[5]).toBe(14);
    expect(b.elements[6]).toBe(15);
    expect(b.elements[8]).toBe(16);
    expect(b.elements[9]).toBe(17);
    expect(b.elements[10]).toBe(18);
  });

  test('toArray', () => {
    const a = new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
    // After set(1, 2, 3, 4, 5, 6, 7, 8, 9):
    //   te[0]=1(n11), te[1]=4(n21), te[2]=7(n31), te[3]=0(pad)
    //   te[4]=2(n12), te[5]=5(n22), te[6]=8(n32), te[7]=0(pad)
    //   te[8]=3(n13), te[9]=6(n23), te[10]=9(n33), te[11]=0(pad)
    // toArray writes at indices 0-2, 4-6, 8-10 (sparse)

    const array = a.toArray();
    expect(array[0]).toBe(1);
    expect(array[1]).toBe(4);
    expect(array[2]).toBe(7);
    expect(array[4]).toBe(2);
    expect(array[5]).toBe(5);
    expect(array[6]).toBe(8);
    expect(array[8]).toBe(3);
    expect(array[9]).toBe(6);
    expect(array[10]).toBe(9);
  });
});
