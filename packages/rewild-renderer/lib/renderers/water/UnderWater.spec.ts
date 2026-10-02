import { LAKE, OCEAN } from '../terrain/Water';
import { WaterMap } from '../terrain/WaterMap';
import { toFloat16 } from '../../utils/float16';
import {
  UNDER_WATER_FLOATS,
  UNDER_WATER_PROBE_OFFSETS,
  LENS_PROBE_STEP,
  UnderWater,
  WAVE_REACH,
  blendWaterOptics,
  refractedSunCosine,
} from './UnderWater';
import { WaterQuery } from './WaterQuery';

const LEVEL = 5;

function flatMap(): WaterMap {
  const size = 3;
  const texels = size * size;
  const typeWeights = new Uint8Array(texels * 4);
  for (let t = 0; t < texels; t++) typeWeights[t * 4] = 255;
  return {
    size,
    step: 4,
    baseLevel: LEVEL,
    maxLevel: LEVEL,
    shows: true,
    level: new Uint16Array(texels).fill(toFloat16(0)),
    heights: new Uint16Array(texels).fill(toFloat16(-20)),
    coverage: new Uint8Array(texels).fill(255),
    typeWeights,
    bodyIds: new Uint32Array(texels),
    flow: new Int8Array(texels * 2),
    bodies: [],
  };
}

// Records what reaches the uniform, float by float.
function fakeDevice() {
  const uniform = new Float32Array(UNDER_WATER_FLOATS).fill(NaN);
  const device = {
    createBuffer: () => ({ destroy() {} }),
    queue: {
      writeBuffer(
        _buffer: unknown,
        byteOffset: number,
        data: Float32Array,
        dataOffset = 0,
        size = data.length - dataOffset
      ) {
        uniform.set(
          data.subarray(dataOffset, dataOffset + size),
          byteOffset / 4
        );
      },
    },
  };
  return { device: device as unknown as GPUDevice, uniform };
}

function makeQuery(water: WaterMap | null) {
  return new WaterQuery({
    chunkSize: 16,
    sampleHeight: () => LEVEL - 20,
    waterMapAt: () => water,
  });
}

(globalThis as Record<string, unknown>).GPUBufferUsage ??= {
  UNIFORM: 0x40,
  COPY_DST: 0x08,
};

const SUN = [0, 1, 0];
const RADIANCE = [10, 10, 10];
const NEAR = 0.1;
const MATRIX = Array.from({ length: 16 }, (_, i) => i);

describe('refractedSunCosine', () => {
  it('is 1 for a sun overhead and 0 for one that is down', () => {
    expect(refractedSunCosine(1)).toBeCloseTo(1);
    expect(refractedSunCosine(0)).toBe(0);
    expect(refractedSunCosine(-0.5)).toBe(0);
  });

  it('bends a low sun toward straight down', () => {
    expect(refractedSunCosine(0.1)).toBeGreaterThan(0.6);
  });
});

describe('blendWaterOptics', () => {
  it('blends absorption plus turbidity, and the in-water glow, by weight', () => {
    const extinction = new Float64Array(3);
    const inScatter = new Float64Array(3);
    blendWaterOptics([OCEAN, LAKE], [0.5, 0.5, 0, 0], extinction, inScatter);
    expect(extinction[0]).toBeCloseTo(
      0.5 * (OCEAN.absorption[0] + OCEAN.turbidity) +
        0.5 * (LAKE.absorption[0] + LAKE.turbidity)
    );
    expect(inScatter[2]).toBeCloseTo(
      0.5 * OCEAN.inScatter[2] + 0.5 * LAKE.inScatter[2]
    );
  });
});

describe('UnderWater.update', () => {
  it('may be under water near the level, and not far above it', () => {
    const { device } = fakeDevice();
    const query = makeQuery(flatMap());
    const underWater = new UnderWater();
    underWater.update(
      device,
      query,
      [OCEAN],
      0,
      LEVEL + 1,
      0,
      SUN,
      RADIANCE,
      NEAR,
      MATRIX
    );
    expect(underWater.covered).toBe(true);
    expect(underWater.possible).toBe(true);
    underWater.update(
      device,
      query,
      [OCEAN],
      0,
      LEVEL + WAVE_REACH + 1,
      0,
      SUN,
      RADIANCE,
      NEAR,
      MATRIX
    );
    expect(underWater.possible).toBe(false);
  });

  it('is out of the water where none covers the camera', () => {
    const { device } = fakeDevice();
    const underWater = new UnderWater();
    underWater.update(
      device,
      makeQuery(null),
      [OCEAN],
      0,
      0,
      0,
      SUN,
      RADIANCE,
      NEAR,
      MATRIX
    );
    expect(underWater.covered).toBe(false);
    expect(underWater.possible).toBe(false);
    expect(underWater.submerged).toBe(false);
  });

  it('writes every field but the probes, which the GPU copies in', () => {
    const { device, uniform } = fakeDevice();
    const underWater = new UnderWater();
    underWater.update(
      device,
      makeQuery(flatMap()),
      [OCEAN],
      0,
      2,
      0,
      SUN,
      RADIANCE,
      NEAR,
      MATRIX
    );
    // The probes, from the second vec4 to the fourth, are the GPU's.
    const probes = UNDER_WATER_PROBE_OFFSETS[0] / 4;
    for (let i = 0; i < UNDER_WATER_FLOATS; i++)
      if (i >= probes && i < probes + 12) expect(uniform[i]).toBeNaN();
      else expect(uniform[i]).not.toBeNaN();
    expect(uniform[0]).toBe(1);
    expect(uniform[1]).toBe(2);
    expect(uniform[2]).toBeCloseTo(LEVEL);
    expect(uniform[3]).toBeCloseTo(LEVEL - 20);
    expect(uniform[16]).toBeCloseTo(OCEAN.absorption[0] + OCEAN.turbidity);
    expect(uniform[20]).toBeCloseTo(OCEAN.inScatter[0]);
    // An overhead sun goes straight down, at its full radiance less the share
    // the surface reflects.
    expect(uniform[24]).toBeCloseTo(9.8);
    expect(uniform[27]).toBeCloseTo(1);
    expect(uniform[29]).toBeCloseTo(1);
    expect(uniform[32]).toBeCloseTo(NEAR);
    expect(uniform[33]).toBeCloseTo(LENS_PROBE_STEP);
    expect(Array.from(uniform.subarray(36, 52))).toEqual(MATRIX);
  });

  it('takes the camera out of the water when cleared', () => {
    const { device, uniform } = fakeDevice();
    const underWater = new UnderWater();
    underWater.update(
      device,
      makeQuery(flatMap()),
      [OCEAN],
      0,
      2,
      0,
      SUN,
      RADIANCE,
      NEAR,
      MATRIX
    );
    underWater.clear(device);
    expect(underWater.possible).toBe(false);
    expect(underWater.covered).toBe(false);
    expect(uniform[0]).toBe(0);
  });
});
