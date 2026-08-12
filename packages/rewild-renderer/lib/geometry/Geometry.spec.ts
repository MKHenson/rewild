import { Matrix4 } from 'rewild-common';
import { Geometry } from './Geometry';

/**
 * One triangle in the XY plane, normals on +Z. Everything below varies only its
 * UVs, because the UV parameterization is the entire input to a tangent frame
 * that positions and normals do not already provide.
 */
function triangle(uvs: number[], indices?: number[]): Geometry {
  const geometry = new Geometry();
  geometry.vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  geometry.normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  geometry.uvs = new Float32Array(uvs);
  if (indices) geometry.indices = new Uint32Array(indices);
  return geometry;
}

describe('computeTangents', () => {
  it('points the tangent the way U runs across the surface', () => {
    const geometry = triangle([0, 0, 1, 0, 0, 1]);

    geometry.computeTangents();

    expect(Array.from(geometry.tangents!.slice(0, 4))).toEqual([1, 0, 0, 1]);
  });

  it('reads the same frame off an indexed triangle', () => {
    const geometry = triangle([0, 0, 1, 0, 0, 1], [0, 1, 2]);

    geometry.computeTangents();

    expect(Array.from(geometry.tangents!.slice(0, 4))).toEqual([1, 0, 0, 1]);
  });

  // The case the screen-space reconstruction cannot express: with the UVs
  // mirrored, the bitangent runs the other way and only w records it.
  it('records mirrored UVs as negative handedness', () => {
    const geometry = triangle([0, 0, -1, 0, 0, 1]);

    geometry.computeTangents();

    expect(Array.from(geometry.tangents!.slice(0, 4))).toEqual([-1, 0, 0, -1]);
  });

  it('writes four floats per vertex', () => {
    const geometry = triangle([0, 0, 1, 0, 0, 1]);

    geometry.computeTangents();

    expect(geometry.tangents).toHaveLength(12);
    expect(geometry.requiresBuild).toBe(true);
  });

  // A UV-degenerate triangle says nothing about which way U runs. The vertex
  // still needs a frame: a zero tangent normalizes to NaN, and a NaN normal is
  // a black hole in the shading rather than a slightly wrong highlight.
  it('falls back to an arbitrary perpendicular where the UVs are degenerate', () => {
    const geometry = triangle([0, 0, 0, 0, 0, 0]);

    geometry.computeTangents();
    const tangents = geometry.tangents!;

    for (let v = 0; v < 3; v++) {
      const [x, y, z] = Array.from(tangents.slice(v * 4, v * 4 + 3));
      expect(Number.isNaN(x + y + z)).toBe(false);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1);
      // Perpendicular to the +Z normal, which is what makes it usable as a
      // frame at all.
      expect(z).toBeCloseTo(0);
    }
  });

  it('orthogonalizes the tangent against the normal', () => {
    const geometry = triangle([0, 0, 1, 0, 0, 1]);
    // A normal tilted off the triangle, as smoothing across a curved surface
    // produces — the accumulated UV gradient is then no longer perpendicular
    // to it.
    const s = Math.SQRT1_2;
    geometry.normals = new Float32Array([s, 0, s, s, 0, s, s, 0, s]);

    geometry.computeTangents();
    const [x, y, z] = Array.from(geometry.tangents!.slice(0, 3));

    expect(x * s + y * 0 + z * s).toBeCloseTo(0);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1);
  });

  it('does nothing without the UVs it derives from', () => {
    const geometry = triangle([0, 0, 1, 0, 0, 1]);
    geometry.uvs = undefined;
    jest.spyOn(console, 'error').mockImplementation(() => {});

    geometry.computeTangents();

    expect(geometry.tangents).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

describe('applyMatrix4', () => {
  it('rotates the tangent with the geometry, four floats at a time', () => {
    const geometry = triangle([0, 0, 1, 0, 0, 1]);
    geometry.computeTangents();

    // +X onto +Z, which is where a quarter turn about Y sends it.
    geometry.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2));
    const [x, y, z, w] = Array.from(geometry.tangents!.slice(0, 4));

    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
    expect(w).toBe(1);
  });

  // A mirroring transform swaps which way the bitangent runs, and the bitangent
  // is not stored — the handedness in w is the only place that can record it.
  it('flips handedness under a mirroring transform', () => {
    const geometry = triangle([0, 0, 1, 0, 0, 1]);
    geometry.computeTangents();

    geometry.applyMatrix4(new Matrix4().makeScale(-1, 1, 1));

    expect(geometry.tangents![3]).toBe(-1);
  });
});
