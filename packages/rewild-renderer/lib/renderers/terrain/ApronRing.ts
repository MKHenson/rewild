// The one-sample ring the generator produces around a chunk's heights, for
// seamless edge normals (see buildChunkMesh). An unedited chunk keeps the ring
// so later LOD builds can send heights + ring instead of generating again. The
// ring is 4·size + 4 samples. The whole aproned field would be (size + 2)²,
// most of which the chunk already holds as its heights.
//
// Layout: the apron's top row, its bottom row, then its left and right columns
// for the inner rows only (the corners belong to the two rows).

export const apronRingLength = (size: number) => 4 * size + 4;

// Copies the ring out of a (size + 2)² aproned field.
export function extractApronRing(
  apron: Float32Array,
  size: number
): Float32Array {
  const a = size + 2;
  const ring = new Float32Array(apronRingLength(size));
  ring.set(apron.subarray(0, a), 0);
  ring.set(apron.subarray((a - 1) * a, a * a), a);
  const left = 2 * a;
  const right = left + size;
  for (let y = 0; y < size; y++) {
    const row = (y + 1) * a;
    ring[left + y] = apron[row];
    ring[right + y] = apron[row + a - 1];
  }
  return ring;
}

// Builds the (size + 2)² aproned field from a chunk's size² heights and its
// ring. The inverse of extractApronRing plus extracting the centre.
export function assembleApron(
  inner: Float32Array,
  ring: Float32Array,
  size: number
): Float32Array {
  const a = size + 2;
  const apron = new Float32Array(a * a);
  apron.set(ring.subarray(0, a), 0);
  apron.set(ring.subarray(a, 2 * a), (a - 1) * a);
  const left = 2 * a;
  const right = left + size;
  for (let y = 0; y < size; y++) {
    const row = (y + 1) * a;
    apron[row] = ring[left + y];
    apron.set(inner.subarray(y * size, y * size + size), row + 1);
    apron[row + a - 1] = ring[right + y];
  }
  return apron;
}
