import { readFileSync } from 'fs';
import { join } from 'path';
import { ALPHA_MODES, StandardMaterial } from './StandardMaterial';

// The struct and the alpha modes live in the include both standard.wgsl and
// standard-instanced.wgsl pull in, so pinning it here pins both passes.
const SHADER = readFileSync(
  join(__dirname, '../../shaders/shader-lib/standard-material.wgsl'),
  'utf8'
);

// The uniform block is written here and read in standard.wgsl, and nothing
// checks that the two agree — a swapped pair of scalars is valid WGSL, valid
// TypeScript, and shows up only as a material that shades wrong. These tests
// are that check.
describe('StandardParams packing', () => {
  // _writeParams only ever touches queue.writeBuffer, so a stub queue is enough
  // to capture what would have gone to the GPU.
  function packOf(material: StandardMaterial): Float32Array {
    let written: Float32Array | undefined;
    const device = {
      queue: {
        writeBuffer: (
          _buffer: unknown,
          _offset: number,
          data: Float32Array
        ) => {
          written = new Float32Array(data);
        },
      },
    };

    (material as never as { _writeParams: (d: unknown) => void })._writeParams(
      device
    );

    if (!written) throw new Error('_writeParams wrote nothing');
    return written;
  }

  it('writes every field at the offset the shader reads it from', () => {
    const material = new StandardMaterial(1);
    material.baseColorFactor = [0.1, 0.2, 0.3, 0.4];
    material.emissiveColor = [0.5, 0.6, 0.7];
    material.roughness = 0.8;
    material.emissiveStrength = 3;
    material.metallic = 0.13;
    material.occlusionStrength = 0.14;
    material.normalScale = 0.15;
    material.alphaCutoff = 0.16;

    const packed = packOf(material);

    // Indices are byte offsets / 4, i.e. the layout table at the top of
    // StandardMaterial.ts.
    expect(Array.from(packed.slice(0, 4))).toEqual([
      Math.fround(0.1),
      Math.fround(0.2),
      Math.fround(0.3),
      Math.fround(0.4),
    ]);
    expect(Array.from(packed.slice(4, 7))).toEqual([
      Math.fround(0.5),
      Math.fround(0.6),
      Math.fround(0.7),
    ]);
    expect(packed[7]).toBeCloseTo(0.8);
    expect(packed[8]).toBe(3);
    expect(packed[9]).toBeCloseTo(0.13);
    expect(packed[10]).toBeCloseTo(0.14);
    expect(packed[11]).toBeCloseTo(0.15);
    expect(packed[12]).toBeCloseTo(0.16);
  });

  it('is the size the layout table claims', () => {
    expect(packOf(new StandardMaterial(1)).byteLength).toBe(64);
  });

  // The one integer in the block. Written through a Uint32Array view, so a
  // float write here would land as a denormal the shader compares as garbage.
  it('writes alphaMode as an integer in its own row', () => {
    const material = new StandardMaterial(1);
    material.alphaMode = 'BLEND';

    const asU32 = new Uint32Array(packOf(material).buffer);
    expect(asU32[13]).toBe(ALPHA_MODES.indexOf('BLEND'));
  });

  it('defaults to the glTF defaults', () => {
    const material = new StandardMaterial(1);

    expect(material.baseColorFactor).toEqual([1, 1, 1, 1]);
    expect(material.alphaMode).toBe('OPAQUE');
    expect(material.alphaCutoff).toBe(0.5);
    // Black emissive with a strength of 1 — the same "no emission" as the
    // white-with-zero-strength pairing, but the pairing glTF specifies.
    expect(material.emissiveColor).toEqual([0, 0, 0]);
    expect(material.emissiveStrength).toBe(1);
  });
});

describe('standard-material.wgsl agreement', () => {
  const struct = SHADER.match(/struct StandardParams \{([^}]*)\}/)![1];
  // Trimmed before the comment strip so a checkout with CRLF endings does not
  // leave a \r the `.` in the pattern refuses to cross.
  const fields = struct
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/\/\/.*/, '')
        .trim()
    )
    .filter((line) => line.length > 0)
    .map((line) => line.split(':')[0].trim());

  it('declares the fields in the order they are packed', () => {
    expect(fields).toEqual([
      'baseColorFactor',
      'emissiveColor',
      'roughness',
      'emissiveStrength',
      'metallic',
      'occlusionStrength',
      'normalScale',
      'alphaCutoff',
      'alphaMode',
      '_pad0',
      '_pad1',
    ]);
  });

  it('numbers the alpha modes the same way', () => {
    for (let i = 0; i < ALPHA_MODES.length; i++) {
      const constant = new RegExp(
        `const ALPHA_MODE_${ALPHA_MODES[i]}\\s*:\\s*u32\\s*=\\s*(\\d+)u`
      );
      expect(SHADER.match(constant)?.[1]).toBe(String(i));
    }
  });
});
