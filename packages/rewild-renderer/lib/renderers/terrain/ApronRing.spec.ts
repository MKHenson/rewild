import { apronRingLength, assembleApron, extractApronRing } from './ApronRing';

const SIZE = 5;
const A = SIZE + 2;

/** An aproned field where every sample is distinct, so a misplaced copy shows. */
const distinctApron = () => {
  const apron = new Float32Array(A * A);
  for (let i = 0; i < apron.length; i++) apron[i] = i + 0.5;
  return apron;
};

/** The size² centre of an aproned field. */
const centre = (apron: Float32Array) => {
  const inner = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++)
    inner.set(
      apron.subarray((y + 1) * A + 1, (y + 1) * A + 1 + SIZE),
      y * SIZE
    );
  return inner;
};

describe('ApronRing', () => {
  it('holds every sample outside the centre, and nothing else', () => {
    expect(apronRingLength(SIZE)).toBe(A * A - SIZE * SIZE);
    expect(extractApronRing(distinctApron(), SIZE)).toHaveLength(
      apronRingLength(SIZE)
    );
  });

  it('rebuilds the exact field from its centre and ring', () => {
    const apron = distinctApron();
    const ring = extractApronRing(apron, SIZE);

    expect(assembleApron(centre(apron), ring, SIZE)).toEqual(apron);
  });
});
