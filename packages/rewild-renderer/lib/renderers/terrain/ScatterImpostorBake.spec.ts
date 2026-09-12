import { Vector3 } from 'rewild-common';
import { billboardFrame, hemiOctDecode } from './ScatterImpostorBake';

// The shader's encode, so the two directions of the mapping can be checked
// against each other: impostorOctUv in shader-lib/scatter-impostor.wgsl.
function hemiOctEncode(dir: Vector3): [number, number] {
  const sum = Math.abs(dir.x) + Math.abs(dir.y) + Math.abs(dir.z);
  const nx = dir.x / sum;
  const nz = dir.z / sum;
  return [(nx + nz) * 0.5 + 0.5, (nx - nz) * 0.5 + 0.5];
}

describe('hemiOctDecode', () => {
  const out = new Vector3();

  it('puts the pole at the centre of the square', () => {
    hemiOctDecode(0.5, 0.5, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0);
  });

  it('puts the horizon round the edge', () => {
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [0, 0.5],
      [0.5, 1],
    ]) {
      hemiOctDecode(u, v, out);
      expect(out.y).toBeCloseTo(0);
      expect(out.length()).toBeCloseTo(1);
    }
  });

  // A tile is captured from the decoded direction and looked up by the
  // encoded one, so the two must agree everywhere on the square.
  it('inverts the shader encode', () => {
    for (let i = 0; i <= 7; i++)
      for (let j = 0; j <= 7; j++) {
        const u = i / 7;
        const v = j / 7;
        hemiOctDecode(u, v, out);
        const [eu, ev] = hemiOctEncode(out);
        expect(eu).toBeCloseTo(u, 5);
        expect(ev).toBeCloseTo(v, 5);
      }
  });
});

describe('billboardFrame', () => {
  const right = new Vector3();
  const up = new Vector3();

  it('is right-handed with the view direction', () => {
    const dir = new Vector3(1, 1, 0.5).normalize();
    billboardFrame(dir, right, up);
    const cross = new Vector3().crossVectors(right, up);
    expect(cross.x).toBeCloseTo(dir.x);
    expect(cross.y).toBeCloseTo(dir.y);
    expect(cross.z).toBeCloseTo(dir.z);
    expect(right.dot(up)).toBeCloseTo(0);
    expect(right.length()).toBeCloseTo(1);
    expect(up.length()).toBeCloseTo(1);
  });

  it('keeps up upward from the horizon', () => {
    billboardFrame(new Vector3(0, 0, 1), right, up);
    expect(up.y).toBeCloseTo(1);
    expect(right.x).toBeCloseTo(1);
  });

  it('still has a frame straight down the pole', () => {
    billboardFrame(new Vector3(0, 1, 0), right, up);
    expect(right.length()).toBeCloseTo(1);
    expect(up.length()).toBeCloseTo(1);
    expect(right.dot(up)).toBeCloseTo(0);
  });
});
