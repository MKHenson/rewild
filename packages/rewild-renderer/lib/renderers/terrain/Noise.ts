import { inverseLerp, Perlin, Vector2 } from 'rewild-common';

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
  lacunarity: number = 1.75,
  offset: Vector2 = new Vector2(0, 0)
): Float32Array {
  const perlin = new Perlin(seed);
  const noiseMap = new Float32Array(width * height);

  if (octaves < 1) {
    octaves = 1; // Ensure at least one octave
  }
  if (persistence < 0) {
    persistence = 0; // Ensure non-negative persistence
  }
  if (lacunarity < 1) {
    lacunarity = 1; // Ensure lacunarity is at least 1
  }
  if (width <= 0 || height <= 0) {
    throw new Error('Width and height must be positive integers.');
  }
  if (scale <= 0) {
    throw new Error('Scale must be a positive number.');
  }

  const rng = seededRandom(seed);

  const octaveOffsets: Vector2[] = [];
  for (let i = 0; i < octaves; i++) {
    const offsetX = rng() * 10000 + offset.x;
    const offsetY = rng() * 10000 + offset.y;
    octaveOffsets.push(new Vector2(offsetX, offsetY));
  }

  if (scale <= 0) {
    scale = 0.0001; // Avoid division by zero or negative scale
  }

  let maxNoiseValue = Number.MIN_VALUE;
  let minNoiseValue = Number.MAX_VALUE;

  let halfWidth = width / 2;
  let halfHeight = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let amplitude = 1;
      let frequency = 1;
      let noiseValue = 0;

      for (let o = 0; o < octaves; o++) {
        const sampleX =
          ((x - halfWidth) / scale) * frequency + octaveOffsets[o].x;
        const sampleY =
          ((y - halfHeight) / scale) * frequency + octaveOffsets[o].y;

        let value = perlin.perlin2(sampleX, sampleY) * amplitude;

        // Normalize the value to be between 0 and 1
        value = (value + 1) / 2; // Perlin noise ranges from -1 to 1

        noiseValue += value;

        amplitude *= persistence;
        frequency *= lacunarity;
      }

      if (noiseValue > maxNoiseValue) {
        maxNoiseValue = noiseValue;
      } else if (noiseValue < minNoiseValue) {
        minNoiseValue = noiseValue;
      }

      noiseMap[x + y * width] = noiseValue;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Normalize the noise value to be between 0 and 1

      noiseMap[x + y * width] = inverseLerp(
        minNoiseValue,
        maxNoiseValue,
        noiseMap[x + y * width]
      );
    }
  }

  return noiseMap;
}
