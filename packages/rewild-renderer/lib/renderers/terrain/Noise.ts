import { Perlin, Vector2 } from 'rewild-common';

function seededRandom(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return function () {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function generateNoiseMap(
  width: number,
  height: number,
  scale: number,
  seed: number = 100,
  octaves: number = 4,
  persistence: number = 0.5,
  lacunarity: number = 2.0,
  offset: Vector2 = new Vector2(0, 0)
): Float32Array {
  const perlin = new Perlin(seed);
  const noiseMap = new Float32Array(width * height);

  if (octaves < 1) octaves = 1;
  if (persistence < 0) persistence = 0;
  if (lacunarity < 1) lacunarity = 1;
  if (width <= 0 || height <= 0) throw new Error('Width and height must be positive integers.');
  if (scale <= 0) throw new Error('Scale must be a positive number.');

  const rng = seededRandom(seed);

  const octaveOffsets: Vector2[] = new Array(octaves);
  for (let i = 0; i < octaves; i++) {
    const offsetX = rng() * 200000 - 100000 + offset.x;
    const offsetY = rng() * 200000 - 100000 + offset.y;
    octaveOffsets[i] = new Vector2(offsetX, offsetY);
  }

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let amplitude = 1;
      let frequency = 1;
      let noiseValue = 0;

      for (let o = 0; o < octaves; o++) {
        const sampleX = ((x - halfWidth + octaveOffsets[o].x) / scale) * frequency;
        const sampleY = ((y - halfHeight - octaveOffsets[o].y) / scale) * frequency;

        noiseValue += perlin.simplex2(sampleX, sampleY) * amplitude;

        amplitude *= persistence;
        frequency *= lacunarity;
      }

      noiseMap[x + y * width] = noiseValue;
    }
  }

  // Normalize to [0,1] using the theoretical max amplitude for this octave/persistence
  // combination. Because this is a fixed constant (not per-chunk min/max), normalization
  // is continuous across chunk boundaries — no seams.
  const maxAmplitude = (1 - Math.pow(persistence, octaves)) / (1 - persistence);
  for (let i = 0; i < noiseMap.length; i++) {
    noiseMap[i] = (noiseMap[i] / maxAmplitude + 1) * 0.5;
  }

  return noiseMap;
}
