import { leafCellPixels, leafCells } from './lib/atlas.ts';
import { writeGlb, type GlbTextureSet } from './lib/glb.ts';
import { buildMesh, pieceOf, totalTriangles, type ForgeMesh, type MeshAttributes } from './lib/mesh.ts';
import { CLUMP_MAX_PATCH_RADIUS, impostorDistance, parseConfig, resolveParams, sameTexture, tierParams, toConfig, type Params, type RawConfig } from './lib/params.ts';
import { fbm, gradientNoise, signedFbm, valueNoise, warp, worley } from './lib/noise.ts';
import { randomSeed } from './lib/rng.ts';
import { renderComparison, renderPreview } from './lib/preview.ts';
import type { Canvas } from './lib/textures.ts';
import { buildSkeleton } from './lib/skeleton.ts';
import { LOOK } from './lib/look.ts';
import { clumpAtlas, CLUMP_CELLS_GENERATED, LEAF_GRID_GENERATED } from './lib/sources.ts';
import { clumpLayer, colliderFor, geometryEntry, scatterLayer, scatterLayerSource } from './lib/templates.ts';
import { buildClump, patchRadiusOf } from './lib/clump.ts';
import { heightPieces, materialPieces } from './lib/pieces.ts';

const TEXTURES: GlbTextureSet = {
  bark: { baseColor: 'a_bark_diff.webp', normal: 'a_bark_nor.webp', arm: 'a_bark_arm.webp' },
  leaf: { baseColor: 'a_leaf_diff.webp', normal: 'a_leaf_nor.webp', arm: 'a_leaf_arm.webp' },
};

/**
 * How the generated bark and leaves look is settled in `lib/look.ts` and is no
 * longer a flag. It is still a field on Params, so a test that has to prove
 * what one of those values does overrides it here rather than on a command
 * line nobody can type.
 */
function paramsFor(extra: RawConfig = {}, look: Partial<Params> = {}): Params {
  return { ...resolveParams({ name: 'test-tree', ...extra }), ...look };
}

function buildAll(extra: RawConfig = {}, look: Partial<Params> = {}) {
  const params = paramsFor(extra, look);
  const skeleton = buildSkeleton(params);
  return { params, skeleton, mesh: buildMesh(params, skeleton, LEAF_GRID_GENERATED) };
}

function readGltf(buffer: Buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.slice(20, 20 + jsonLength).toString('utf8'));
}

describe('params', () => {
  // The CLI rolls a seed for a config that has none, so this fallback is what
  // the library keeps. Without it every seedless test would draw its own tree.
  it('derives a seed from the name so a name alone reproduces a tree', () => {
    expect(paramsFor().seed).toBe(paramsFor().seed);
    expect(resolveParams({ name: 'other-tree' }).seed).not.toBe(paramsFor().seed);
  });

  it('rolls seeds in the range a seed is read as', () => {
    const seeds = Array.from({ length: 64 }, randomSeed);

    for (const seed of seeds) {
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(4294967296);
    }

    // A roll that repeated would hand every unseeded run the same tree.
    expect(new Set(seeds).size).toBeGreaterThan(60);
  });

  it('rejects a name that cannot be a filename or a template key', () => {
    expect(() => resolveParams({ name: 'Oak Tree' })).toThrow(/lowercase/);
  });

  it('refuses a branch count that would explode', () => {
    expect(() => paramsFor({ splits: '6', branchLevels: '6' })).toThrow(/branches/);
  });

  it('refuses a texture size the leaf grid cannot divide', () => {
    expect(() => paramsFor({ textureSize: '1000' })).toThrow(/power of two/);
  });
});

describe('config', () => {
  it('reads every option out of a saved tree', () => {
    const params = resolveParams(
      parseConfig({ name: 'saved-tree', height: 17, leafSize: 3 }, 'test.json')
    );

    expect(params.name).toBe('saved-tree');
    expect(params.height).toBe(17);
    expect(params.leafSize).toBe(3);
  });

  it('opens a sidecar written before the look was settled', () => {
    // Those keys are fields on Params but no longer input, so a file still
    // carrying them has to load and ignore them. Erroring the way an unknown
    // key does would strand every tree.json already on disk.
    const params = resolveParams(
      parseConfig(
        { name: 'saved-tree', knots: 0, grooveDepth: 0.9, barkTint: '#ffffff', barkTile: 9 },
        'test.json'
      )
    );

    expect(params.knots).toBe(LOOK.knots);
    expect(params.grooveDepth).toBe(LOOK.grooveDepth);
    expect(params.barkTint).toBe(LOOK.barkTint);
    expect(params).not.toHaveProperty('barkTile');
  });

  it('drops the settled look values on the way back out', () => {
    expect(toConfig(paramsFor())).not.toHaveProperty('knots');
    expect(toConfig(paramsFor())).not.toHaveProperty('barkTint');
  });

  it('reads the source lists and holds them to folder names', () => {
    const params = resolveParams(parseConfig({ name: 'a', bark: ['poplar'], leaves: ['oak', 'poplar'] }, 'test.json'));
    expect(params.bark).toEqual(['poplar']);
    expect(params.leaves).toEqual(['oak', 'poplar']);
    expect(paramsFor().bark).toEqual([]);

    expect(() => parseConfig({ name: 'a', leaves: 'oak' }, 'test.json')).not.toThrow();
    expect(() => paramsFor({ leaves: 'oak' })).toThrow(/list of source names/);
    expect(() => parseConfig({ name: 'a', leaves: [1] }, 'test.json')).toThrow(/list of strings/);
    expect(() => paramsFor({ bark: ['Oak Bark'] })).toThrow(/lowercase/);
  });

  it('rejects an unknown option rather than dropping it', () => {
    // The file exists to be hand-edited, so a silently ignored typo is a change
    // that appears not to have worked.
    expect(() => parseConfig({ name: 'a', hieght: 9 }, 'test.json')).toThrow(/unknown option 'hieght'/);
  });

  it('opens a sidecar that still names a config and a watch', () => {
    // Both were keys once. A file carrying them has to load, or every sidecar
    // written before they went is stranded.
    const params = resolveParams(parseConfig({ name: 'a', config: 'a.tree.json', watch: false }, 'test.json'));
    expect(params).not.toHaveProperty('config');
    expect(params).not.toHaveProperty('watch');
  });

  it('refuses anything that is not a JSON object', () => {
    expect(() => parseConfig([1, 2], 'test.json')).toThrow(/JSON object/);
    expect(() => parseConfig('nope', 'test.json')).toThrow(/JSON object/);
  });

  it('writes a sidecar that reads back as the same tree', () => {
    const first = paramsFor({ height: '13', splits: '4' });
    const round = resolveParams(parseConfig(toConfig(first), 'test.json'));

    expect(round).toEqual(first);
  });
});

describe('texture reuse', () => {
  it('reuses the texture across a mesh edit and rebuilds it across a texture edit', () => {
    const base = paramsFor();

    expect(sameTexture(base, paramsFor({ height: '20' }))).toBe(true);
    expect(sameTexture(base, paramsFor({ splits: '5' }))).toBe(true);
    // Four things left that change an image, now that the look is settled.
    expect(sameTexture(base, paramsFor({ seed: '42' }))).toBe(false);
    expect(sameTexture(base, paramsFor({ barkProfile: 'smooth' }))).toBe(false);
    expect(sameTexture(base, paramsFor({ textureSize: '512' }))).toBe(false);
    // An authored leaf is fitted to the card, so the card's size is in the image.
    expect(sameTexture(base, paramsFor({ leafSize: '2' }))).toBe(false);
    // And which art fills it. Lists compare by value, not by identity.
    expect(sameTexture(base, paramsFor({ leaves: [] }))).toBe(true);
    expect(sameTexture(base, paramsFor({ leaves: ['oak'] }))).toBe(false);
  });

});

describe('skeleton', () => {
  it('stands on the origin at exactly the requested height', () => {
    const { skeleton } = buildAll({ height: '9' });
    const heights = skeleton.branches.flatMap((branch) => branch.points.map((point) => point.p[1]));

    expect(Math.min(...heights)).toBeCloseTo(0, 5);
    expect(Math.max(...heights)).toBeCloseTo(9, 5);
  });

  it('hangs leaves off the deepest generations, not only the tips', () => {
    const shallow = buildAll({ leafLevels: '1' }).skeleton.branches.filter((branch) => branch.bearsLeaves);
    const deep = buildAll({ leafLevels: '3' }).skeleton.branches.filter((branch) => branch.bearsLeaves);

    expect(deep.length).toBeGreaterThan(shallow.length);
    expect(shallow.every((branch) => branch.children.length === 0)).toBe(true);
  });

  it('refuses more leaf levels than the tree has generations', () => {
    expect(() => paramsFor({ branchLevels: '2', leafLevels: '4' })).toThrow(/leafLevels/);
  });

  it('pulls the crown in when droop is negative', () => {
    // Split angles compound with depth, so upward attraction is the only thing
    // stopping a deep tree from fanning into a disc.
    const spreading = buildAll({ droop: '30' }).skeleton.canopy.spread;
    const upright = buildAll({ droop: '-30' }).skeleton.canopy.spread;

    expect(upright).toBeLessThan(spreading);
  });

  it('keeps branches next to each other in height far apart in angle', () => {
    // An even fraction of a turn per child ties azimuth to attach height and
    // winds the whorl up one side as a tight helix.
    const { skeleton } = buildAll({ splits: '8', splitSpread: '0.9', branchLevels: '1' });
    const limbs = skeleton.branches.filter((branch) => branch.level === 1).slice(1);

    const azimuths = limbs.map((branch) =>
      (Math.atan2(branch.points[1].p[2] - branch.points[0].p[2], branch.points[1].p[0] - branch.points[0].p[0]) * 180) /
      Math.PI
    );

    for (let i = 1; i < azimuths.length; i++)
      expect(Math.abs((((azimuths[i] - azimuths[i - 1]) % 360) + 540) % 360 - 180)).toBeGreaterThan(60);
  });

  it('forks below the canopy', () => {
    const { skeleton } = buildAll();
    expect(skeleton.trunk.splitHeight).toBeGreaterThan(0);
    expect(skeleton.trunk.splitHeight).toBeLessThan(skeleton.canopy.centre[1]);
  });
});

describe('COLOR_0', () => {
  it('runs bend from rigid at the base to free at the tips', () => {
    const { mesh } = buildAll();
    const bark = [...pieceOf(mesh, 'bark').colors].filter((_, i) => i % 4 === 0);
    const leaves = [...pieceOf(mesh, 'leaf').colors].filter((_, i) => i % 4 === 0);

    expect(Math.min(...bark)).toBeCloseTo(0, 3);
    expect(Math.max(...leaves)).toBeGreaterThan(Math.max(...bark));
    expect(Math.max(...leaves)).toBeLessThanOrEqual(1);
  });

  it('flutters leaves only, and never the bark', () => {
    const { mesh } = buildAll();
    const barkFlutter = [...pieceOf(mesh, 'bark').colors].filter((_, i) => i % 4 === 2);
    const leafFlutter = [...pieceOf(mesh, 'leaf').colors].filter((_, i) => i % 4 === 2);

    expect(Math.max(...barkFlutter)).toBe(0);
    expect(Math.min(...leafFlutter)).toBe(0);
    expect(Math.max(...leafFlutter)).toBe(1);
  });

  it('gives each limb its own phase, constant across that limb', () => {
    const { mesh, skeleton } = buildAll();
    const phases = new Set([...pieceOf(mesh, 'bark').colors].filter((_, i) => i % 4 === 1));
    const limbs = new Set(skeleton.branches.map((branch) => branch.clusterId));

    expect(phases.size).toBe(limbs.size);
  });
});

describe('winding', () => {
  /** Share of triangles whose index order agrees with their vertex normals. */
  function facingAgreement(attributes: MeshAttributes): number {
    const { positions, normals, indices } = attributes;
    const at = (i: number, a: Float32Array): [number, number, number] => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
    let agree = 0;
    let total = 0;

    for (let t = 0; t < indices.length; t += 3) {
      const [p0, p1, p2] = [at(indices[t], positions), at(indices[t + 1], positions), at(indices[t + 2], positions)];
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const face = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];

      const vertex = at(indices[t], normals);
      const dot = face[0] * vertex[0] + face[1] * vertex[1] + face[2] * vertex[2];
      if (Math.abs(dot) < 1e-12) continue;

      total++;
      if (dot > 0) agree++;
    }

    return agree / total;
  }

  it('winds bark counter-clockwise seen from outside the trunk', () => {
    // The bark material is single sided, so a reversed winding culls the near
    // wall of the tube and draws its far inside. That reads as a dark, hollow
    // trunk, and nothing else in the pipeline checks it.
    expect(facingAgreement(pieceOf(buildAll().mesh, 'bark'))).toBe(1);
  });

  it('winds leaf cards to face the way their card points', () => {
    // Measured against the card normal, because the default canopy normals
    // deliberately do not follow the card.
    expect(facingAgreement(pieceOf(buildAll({ leafNormalMode: 'card' }).mesh, 'leaf'))).toBe(1);
  });
});

describe('leaf normals', () => {
  function leafNormals(mode: string) {
    const { skeleton, mesh } = buildAll({ leafNormalMode: mode });
    const { normals, positions, vertexCount } = pieceOf(mesh, 'leaf');
    const at = (i: number, a: Float32Array): [number, number, number] => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
    return { skeleton, normals, positions, vertexCount, at };
  }

  it('never points a canopy normal at the ground', () => {
    // A crown hangs well below its own centre, so a plain outward normal sends
    // half the cards face down. Those take bounce light only and the lower
    // canopy reads as a hole rather than as the underside of a mass.
    const { normals, vertexCount } = leafNormals('canopy');
    for (let i = 0; i < vertexCount; i++) expect(normals[i * 3 + 1]).toBeGreaterThan(0);
  });

  it('still turns a canopy normal away from the crown centre', () => {
    // The lift is vertical only, so the horizontal half has to survive it or
    // the crown shades as a flat disc.
    const { skeleton, normals, positions, vertexCount, at } = leafNormals('canopy');
    const centre = skeleton.canopy.centre;
    let agree = 0;
    let total = 0;

    // Measured from the card's own middle, which is what the normal is taken
    // from. A corner of a card straddling the centre sits on the far side of it.
    for (let card = 0; card < vertexCount / 4; card++) {
      let outX = 0;
      let outZ = 0;
      for (let k = 0; k < 4; k++) {
        const [px, , pz] = at(card * 4 + k, positions);
        outX += (px - centre[0]) / 4;
        outZ += (pz - centre[2]) / 4;
      }

      if (Math.hypot(outX, outZ) < 0.5) continue;
      const [nx, , nz] = at(card * 4, normals);
      total++;
      if (nx * outX + nz * outZ > 0) agree++;
    }

    expect(agree / total).toBe(1);
  });

  it('gives every card one normal', () => {
    // Per corner instead swings the direction across a single card wherever
    // one sits near the crown centre, which shades as a crease.
    for (const mode of ['canopy', 'card', 'up']) {
      const { normals, vertexCount, at } = leafNormals(mode);
      for (let card = 0; card < vertexCount / 4; card++) {
        const first = at(card * 4, normals);
        for (let k = 1; k < 4; k++)
          for (let axis = 0; axis < 3; axis++)
            expect(at(card * 4 + k, normals)[axis]).toBeCloseTo(first[axis], 6);
      }
    }
  });
});

describe('bark uvs', () => {
  /** Texels per metre along the branch over texels per metre around it, per ring segment. */
  function uvAspects(params: ReturnType<typeof paramsFor>, skeleton: ReturnType<typeof buildSkeleton>): number[] {
    const { positions, uvs } = pieceOf(buildMesh(params, skeleton, LEAF_GRID_GENERATED), 'bark');
    const aspects: number[] = [];
    let cursor = 0;

    for (const branch of skeleton.branches) {
      const radial = Math.max(3, params.radialSegments - branch.level);
      // One degenerate ring is appended to cap the tip, and the seam vertex is
      // duplicated so the ring can close.
      const rings = branch.points.length + 1;
      const stride = radial + 1;

      // Ring centre, mean radius and u, read back off the built mesh.
      const read = (ring: number) => {
        const base = cursor + ring * stride;
        const centre = [0, 0, 0];
        for (let j = 0; j < radial; j++)
          for (let axis = 0; axis < 3; axis++) centre[axis] += positions[(base + j) * 3 + axis] / radial;

        let radius = 0;
        for (let j = 0; j < radial; j++)
          radius +=
            Math.hypot(
              positions[(base + j) * 3] - centre[0],
              positions[(base + j) * 3 + 1] - centre[1],
              positions[(base + j) * 3 + 2] - centre[2]
            ) / radial;

        return { centre, radius, along: uvs[base * 2 + 1] };
      };

      for (let ring = 0; ring < rings - 1; ring++) {
        const a = read(ring);
        const b = read(ring + 1);
        const span = Math.hypot(b.centre[0] - a.centre[0], b.centre[1] - a.centre[1], b.centre[2] - a.centre[2]);
        const circumference = Math.PI * (a.radius + b.radius);
        // The ring maps once across the whole image now that bark owns one, so
        // the around-the-ring density is one repeat per circumference.
        aspects.push(((b.along - a.along) / span) * circumference);
      }

      cursor += rings * stride;
    }

    return aspects;
  }

  it('scales bark with the branch instead of squashing it', () => {
    // v maps once around whatever the branch's girth, so a fixed
    // metres-per-repeat u leaves a thin branch several times denser around
    // than along and the bark reads as squashed. The two densities have to
    // hold one ratio from the trunk base to the last twig.
    const { params, skeleton } = buildAll();
    const aspects = uvAspects(params, skeleton);

    expect(Math.min(...aspects)).toBeGreaterThan(0);
    expect(Math.max(...aspects) / Math.min(...aspects)).toBeLessThan(1.1);
  });

  it('advances length by one circumference per image', () => {
    // Nothing authors the bark's scale any more. The ring maps once across the
    // image, so the image width is one circumference, and length has to advance
    // by the same circumference or the texture is not square on the trunk.
    const { params, skeleton, mesh } = buildAll();
    const trunk = skeleton.branches[0];
    const stride = Math.max(3, params.radialSegments - trunk.level) + 1;
    const along = (ring: number) => pieceOf(mesh, 'bark').uvs[ring * stride * 2 + 1];

    for (let ring = 1; ring < trunk.points.length; ring++) {
      const span = trunk.points[ring].dist - trunk.points[ring - 1].dist;
      const radius = (trunk.points[ring].radius + trunk.points[ring - 1].radius) / 2;
      expect(along(ring) - along(ring - 1)).toBeCloseTo(span / (2 * Math.PI * radius), 5);
    }
  });
});

describe('atlas', () => {
  it('insets every leaf cell inside its own image', () => {
    // Bark has its own image, so the only thing a cell can bleed into is
    // another cell. The gutter is what holds that off through the mip chain.
    for (const grid of [1, 2, 4]) {
      const cells = leafCells(1024, grid);
      expect(cells).toHaveLength(grid * grid);

      for (const cell of cells) {
        expect(cell.u0).toBeGreaterThan(0);
        expect(cell.v0).toBeGreaterThan(0);
        expect(cell.u1).toBeLessThan(1);
        expect(cell.v1).toBeLessThan(1);
      }
    }
  });

  it('lays the leaf cells out square and covering', () => {
    for (const size of [512, 1024, 2048])
      for (const grid of [1, 2, 4]) {
        const cells = leafCellPixels(size, grid);
        let area = 0;
        for (const cell of cells) {
          expect(cell.width).toBe(cell.height);
          area += cell.width * cell.height;
        }
        // The grid fills the image: bark is no longer sharing it.
        expect(area).toBe(size * size);
      }
  });

  it('repeats every basis exactly where the ring closes', () => {
    // The v span of the bark maps once around the tube, so each field has to
    // meet itself at the band edges or every trunk carries a seam.
    const [px, py] = [8, 6];

    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * py;
      const u = (i / 24) * px;

      expect(gradientNoise(0, t, px, py, 7)).toBeCloseTo(gradientNoise(px, t, px, py, 7), 10);
      expect(gradientNoise(u, 0, px, py, 7)).toBeCloseTo(gradientNoise(u, py, px, py, 7), 10);
      expect(valueNoise(0, t, px, py, 7)).toBeCloseTo(valueNoise(px, t, px, py, 7), 10);
      expect(worley(0, t, px, py, 7).f1).toBeCloseTo(worley(px, t, px, py, 7).f1, 10);
      expect(worley(u, 0, px, py, 7).f1).toBeCloseTo(worley(u, py, px, py, 7).f1, 10);
      expect(warp(0, t, px, py, 7, 0.5)[1]).toBeCloseTo(warp(px, t, px, py, 7, 0.5)[1], 10);
    }
  });

  it('keeps gradient noise inside the range its callers assume', () => {
    // Perlin's raw range is unbounded in principle, and a basis that leaves
    // 0..1 clips the height template flat wherever it does.
    let min = 1;
    let max = 0;

    for (let i = 0; i < 4000; i++) {
      const value = gradientNoise((i * 0.37) % 8, (i * 0.71) % 6, 8, 6, 3);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
  });

  it('maps an octave sum onto the full signed range', () => {
    // fbm does not fill 0..1. It clusters around 0.5 and reaches roughly
    // 0.35..0.66 at four octaves, so `raw * 2 - 1` yields about a third of the
    // swing it appears to, and every parameter scaled by it lands far weaker
    // than it reads. Two features shipped doing nothing before this was found.
    let min = 1;
    let max = -1;

    for (let i = 0; i < 3000; i++) {
      const value = signedFbm((i * 0.019) % 4, (i * 0.037) % 7, 4, 7, 4, 13);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    expect(min).toBeLessThan(-0.85);
    expect(max).toBeGreaterThan(0.85);
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
  });

  it('separates cells so a border can be found', () => {
    // f2 - f1 is the fissure, so the two distances must actually differ.
    const at = worley(2.5, 3.25, 8, 6, 11);
    expect(at.f2).toBeGreaterThan(at.f1);
  });

  it('repeats the bark band exactly where the ring closes', () => {
    // The v span of the bark maps once around the tube, so the field has to
    // meet itself at the band edges or every trunk carries a seam.
    for (let x = 0; x < 8; x++) {
      const fx = x / 8;
      expect(fbm(fx * 6, 0, 6, 28, 5, 17)).toBeCloseTo(fbm(fx * 6, 28, 6, 28, 5, 17), 10);
    }
  });
});

describe('glb', () => {
  it('writes a container whose chunks match their declared lengths', () => {
    const { params, mesh } = buildAll();
    const buffer = writeGlb({ name: params.name, mesh, textures: TEXTURES, alphaCutoff: 0.45 });

    expect(buffer.readUInt32LE(0)).toBe(0x46546c67);
    expect(buffer.readUInt32LE(8)).toBe(buffer.byteLength);

    const jsonLength = buffer.readUInt32LE(12);
    expect(jsonLength % 4).toBe(0);
    expect(buffer.readUInt32LE(20 + jsonLength)).toBe(buffer.byteLength - 20 - jsonLength - 8);
  });

  it('splits opaque bark from cutout leaves', () => {
    const { params, mesh } = buildAll();
    const gltf = readGltf(writeGlb({ name: params.name, mesh, textures: TEXTURES, alphaCutoff: 0.4 }));
    const [bark, leaves] = gltf.materials;

    expect(gltf.meshes[0].primitives).toHaveLength(2);
    expect(bark.alphaMode).toBe('OPAQUE');
    expect(bark.doubleSided).toBe(false);
    expect(leaves.alphaMode).toBe('MASK');
    expect(leaves.alphaCutoff).toBe(0.4);
    expect(leaves.doubleSided).toBe(true);
  });

  it('carries COLOR_0 on both primitives and no tangents', () => {
    const { params, mesh } = buildAll();
    const gltf = readGltf(writeGlb({ name: params.name, mesh, textures: TEXTURES, alphaCutoff: 0.45 }));

    for (const primitive of gltf.meshes[0].primitives) {
      expect(primitive.attributes.COLOR_0).toBeDefined();
      expect(gltf.accessors[primitive.attributes.COLOR_0].type).toBe('VEC4');
      expect(primitive.attributes.TANGENT).toBeUndefined();
    }
  });

  it('reproduces a tree byte for byte from the same seed', () => {
    const build = (extra: RawConfig) => {
      const { params, mesh } = buildAll(extra);
      return writeGlb({ name: params.name, mesh, textures: TEXTURES, alphaCutoff: 0.45 });
    };

    expect(build({ seed: '7' }).equals(build({ seed: '7' }))).toBe(true);
    expect(build({ seed: '7' }).equals(build({ seed: '8' }))).toBe(false);
  });
});

describe('impostor', () => {
  it('derives the handover from cullDistance until the file names one', () => {
    expect(impostorDistance(paramsFor({ cullDistance: '800' }))).toBe(480);
    expect(impostorDistance(paramsFor({ cullDistance: '800', impostorFrom: '192' }))).toBe(192);
  });

  it('carries the tuned handover into the emitted layer', () => {
    const params = paramsFor({ cullDistance: '800', impostorFrom: '192', impostorViews: '12', impostorTile: '256' });
    const layer = scatterLayer(params, buildSkeleton(params));

    expect(layer.impostor).toEqual({ fromDistance: 192, views: 12, tileSize: 256 });
  });

  // The same bounds validateImpostor holds a layer to, so a printed row is one
  // the engine will accept rather than one it refuses on paste.
  it('refuses an impostor the engine would reject', () => {
    expect(() => paramsFor({ cullDistance: '160', impostorFrom: '160' })).toThrow(/never draw/);
    expect(() => paramsFor({ cullDistance: '160', impostorFrom: '200' })).toThrow(/never draw/);
    expect(() => paramsFor({ impostorViews: '1' })).toThrow(/at least 2/);
    expect(() => paramsFor({ impostorTile: '0' })).toThrow(/positive number of pixels/);
    expect(() => paramsFor({ impostorFrom: '-5' })).toThrow(/not be negative/);
  });
});

describe('scatter layer', () => {
  it('measures the trunk capsule off the trunk it stands in', () => {
    const { params, skeleton } = buildAll();
    const collider = colliderFor(params, skeleton);

    // PhysicsShape is a union and most of its members are optional, so the
    // shape is asserted before the measurements are.
    expect(collider.type).toBe('capsule');
    if (collider.type !== 'capsule' || !collider.offset) throw new Error('expected a capsule with an offset');

    const top = collider.offset[1] + collider.height / 2 + collider.radius;

    expect(collider.offset[1] - collider.height / 2 - collider.radius).toBeCloseTo(0, 2);
    expect(top).toBeCloseTo(skeleton.trunk.splitHeight, 1);
    expect(collider.radius).toBeGreaterThan(params.trunkRadius);
  });

  it('declares authored leaf normals for every mode but card', () => {
    // The engine mirrors a back face's normal. That is right only where the
    // normal is the card's own, so canopy and up have to switch it off or half
    // the cards shade from inside the crown.
    for (const [mode, expected] of [
      ['canopy', true],
      ['up', true],
      ['card', false],
    ] as const) {
      const { params, skeleton } = buildAll({ leafNormalMode: mode });
      const layer = scatterLayer(params, skeleton);

      expect(layer.authoredNormals).toBe(expected);
      expect(scatterLayerSource(layer).includes('authoredNormals: true,')).toBe(expected);
    }
  });

  it('reflects off the card and occludes its highlights in every mode', () => {
    // A card is a cluster of leaves whichever way its normal was authored, so
    // the sun must not reflect off the canopy as one sphere in any of them.
    for (const mode of ['canopy', 'up', 'card']) {
      const { params, skeleton } = buildAll({ leafNormalMode: mode });
      const layer = scatterLayer(params, skeleton);
      const source = scatterLayerSource(layer);

      expect(layer.faceNormalSpecular).toBe(true);
      expect(layer.specularOcclusion).toBe(true);
      expect(source).toContain('faceNormalSpecular: true,');
      expect(source).toContain('specularOcclusion: true,');
    }
  });

  it('emits a layer name the library can key on', () => {
    const { params, skeleton } = buildAll();
    const layer = scatterLayer(params, skeleton);

    expect(layer.name).toBe('test_tree');
    expect(layer.geometryId).toBe('test-tree');
    expect(layer.alignToNormal).toBe(0);
    expect(layer.impostor?.fromDistance).toBeDefined();
    expect(layer.impostor!.fromDistance).toBeLessThan(layer.cullDistance);
    expect(layer.footprint).toBeGreaterThan(0);
  });
});

describe('preview', () => {
  /** A flat two-texel canvas. The comparison sheet is about geometry, and a
   *  generated atlas would make this the slowest test in the file. */
  function stubCanvas(): Canvas {
    const texels = 4;
    return {
      size: 2,
      bumpStrength: 1,
      albedo: new Float32Array(texels * 3).fill(0.5),
      alpha: new Float32Array(texels).fill(1),
      height: new Float32Array(texels),
      ao: new Float32Array(texels).fill(1),
      roughness: new Float32Array(texels).fill(0.5),
      metallic: new Float32Array(texels),
    };
  }

  const canvases = { bark: stubCanvas(), leaf: stubCanvas() };
  const SIZE = 64;
  const panels = 2;

  it('lays the model and every tier out in one strip', () => {
    const { params, skeleton, mesh } = buildAll({ lods: [{ distance: 40, barkLevels: 1, leavesPerBranch: 1 }] });
    const tier = buildMesh(tierParams(params, params.lods[0]), skeleton, LEAF_GRID_GENERATED);

    const sheet = renderComparison(
      params,
      [
        { label: 'BASE', mesh },
        { label: 'LOD1', mesh: tier },
      ],
      canvases,
      SIZE
    );

    expect(sheet.width).toBe(SIZE * 2);
    expect(sheet.height).toBe(SIZE);
    expect(sheet.data.length).toBe(SIZE * SIZE * 2 * 3);
  });

  /**
   * The point of the sheet. A projection fitted per panel would redraw a tier
   * that shed geometry larger, and the scale change would read as the handover
   * moving a silhouette that never moved.
   *
   * A leafless tier sits wholly inside the model's bounds, so the shared fit is
   * the model's own. That makes the model's panel identical to its solo render,
   * and the tier's panel necessarily different from its own, because it is
   * drawn at the model's scale rather than at one fitted to it. Fitting per
   * panel is exactly what would make that second render match.
   */
  it('fits every panel through one projection, so a tier cannot drift in scale', () => {
    const { params, skeleton, mesh } = buildAll({ seed: '7', lods: [{ distance: 40, leavesPerBranch: 0 }] });
    const tier = buildMesh(tierParams(params, params.lods[0]), skeleton, LEAF_GRID_GENERATED);

    const sheet = renderComparison(
      params,
      [
        { label: 'A', mesh },
        { label: 'B', mesh: tier },
      ],
      canvases,
      SIZE
    );

    // Below the labels and clear of the divider, so only the render is compared.
    const panel = (index: number): number[] => {
      const bytes: number[] = [];
      for (let y = Math.round(SIZE * 0.4); y < SIZE; y++)
        for (let x = 2; x < SIZE; x++)
          for (let channel = 0; channel < 3; channel++)
            bytes.push(sheet.data[(y * SIZE * panels + index * SIZE + x) * 3 + channel]);
      return bytes;
    };

    const solo = (target: ForgeMesh): number[] => {
      const render = renderPreview(params, target, canvases, SIZE);
      const bytes: number[] = [];
      for (let y = Math.round(SIZE * 0.4); y < SIZE; y++)
        for (let x = 2; x < SIZE; x++)
          for (let channel = 0; channel < 3; channel++)
            bytes.push(render[(y * SIZE + x) * 3 + channel]);
      return bytes;
    };

    expect(panel(0)).toEqual(solo(mesh));
    expect(panel(1)).not.toEqual(solo(tier));
  });
});

describe('LOD tiers', () => {
  const chain: RawConfig = {
    cullDistance: 160,
    lods: [
      { distance: 40, barkLevels: 2, leavesPerBranch: 9, leafScale: 1.4 },
      { distance: 80, radialSegments: 4, barkLevels: 1, leavesPerBranch: 4, leafScale: 2 },
    ],
  };

  it('reads tiers out of a saved tree and writes them back', () => {
    const params = resolveParams(parseConfig({ name: 'tiered', ...chain }, 'test.json'));
    expect(params.lods.map((tier) => tier.distance)).toEqual([40, 80]);

    const round = resolveParams(parseConfig(toConfig(params), 'test.json'));
    expect(round.lods).toEqual(params.lods);
  });

  it('rejects a tier key that is not a mesh override', () => {
    expect(() => parseConfig({ name: 't', lods: [{ distance: 40, seed: 3 }] }, 'test.json')).toThrow(/unknown key 'seed'/);
    expect(() => parseConfig({ name: 't', lods: [{ barkLevels: 1 }] }, 'test.json')).toThrow(/needs a distance/);
  });

  it('holds tiers to ascending distances short of the impostor', () => {
    expect(() => paramsFor({ lods: [{ distance: 80 }, { distance: 40 }] })).toThrow(/must ascend/);
    expect(() => paramsFor({ cullDistance: '100', lods: [{ distance: 60 }] })).toThrow(/beyond the impostor at 60m/);

    // The tier ceiling has to follow impostorFrom, or a chain validated against
    // one distance would ship against another.
    expect(() => paramsFor({ impostorFrom: '50', lods: [{ distance: 60 }] })).toThrow(/beyond the impostor at 50m/);
    expect(() => paramsFor({ impostorFrom: '90', lods: [{ distance: 60 }] })).not.toThrow();
  });

  it('holds a tier to the same bounds as the model', () => {
    expect(() => paramsFor({ lods: [{ distance: 40, radialSegments: 1 }] })).toThrow(/radialSegments/);
  });

  // The chain is what makes a forest affordable, so a tier that is not
  // cheaper than the one before it is a mistake worth catching here.
  it('builds each tier cheaper than the last on the same skeleton', () => {
    const { params, skeleton, mesh } = buildAll(chain);
    const tiers = params.lods.map((tier) => buildMesh(tierParams(params, tier), skeleton, LEAF_GRID_GENERATED));

    let previous = totalTriangles(mesh);
    for (const tier of tiers) {
      const count = totalTriangles(tier);
      expect(count).toBeLessThan(previous);
      previous = count;
    }
  });

  it('drops bark from the twigs beyond barkLevels and keeps their leaves', () => {
    const full = buildAll({ branchLevels: '3', leafLevels: '1' });
    const bare = buildAll({ branchLevels: '3', leafLevels: '1', barkLevels: '1' });

    expect(pieceOf(bare.mesh, 'bark').triangleCount).toBeLessThan(pieceOf(full.mesh, 'bark').triangleCount);
    expect(pieceOf(bare.mesh, 'leaf').triangleCount).toBe(pieceOf(full.mesh, 'leaf').triangleCount);
  });

  it('scales leaf cards by leafScale without touching the texture fit', () => {
    const base = paramsFor();
    const scaled = paramsFor({ leafScale: '2' });
    expect(sameTexture(base, scaled)).toBe(true);

    const cardHeight = (params: Params) => {
      const skeleton = buildSkeleton(params);
      const leaves = pieceOf(buildMesh(params, skeleton, LEAF_GRID_GENERATED), 'leaf');
      const p = leaves.positions;
      // Corners 0 and 3 of the first card are its stem and its tip.
      return Math.hypot(p[9] - p[0], p[10] - p[1], p[11] - p[2]);
    };

    expect(cardHeight(scaled)).toBeCloseTo(cardHeight(base) * 2, 5);
  });

  it('declares the chain to the geometry registry and the scatter layer', () => {
    const { params, skeleton } = buildAll(chain);
    const entry = geometryEntry(params, 'trees/t/t.glb', ['trees/t/t.lod1.glb', 'trees/t/t.lod2.glb']);
    expect(entry['test-tree'].lods).toEqual(['trees/t/t.lod1.glb', 'trees/t/t.lod2.glb']);
    expect(geometryEntry(paramsFor(), 'trees/t/t.glb')['test-tree'].lods).toBeUndefined();

    const layer = scatterLayer(params, skeleton);
    expect(layer.lodDistances).toEqual([40, 80]);
    expect(scatterLayerSource(layer)).toContain('lodDistances: [40, 80],');
    expect(scatterLayer(paramsFor(), skeleton).lodDistances).toBeUndefined();
  });
});

describe('clump', () => {
  const clumpParams = (extra: RawConfig = {}): Params =>
    resolveParams({ type: 'clump', name: 'test-clump', ...extra });

  const build = (extra: RawConfig = {}, cells = CLUMP_CELLS_GENERATED) =>
    buildClump(clumpParams(extra), cells);

  it('rejects a key that belongs to another type, and names the type that takes it', () => {
    expect(() => parseConfig({ type: 'clump', name: 'a', splits: 4 }, 'test.json')).toThrow(
      /'splits' applies to tree, not to type 'clump'/
    );
    expect(() => parseConfig({ name: 'a', cardsPerTuft: 4 }, 'test.json')).toThrow(
      /'cardsPerTuft' applies to clump, not to type 'tree'/
    );
    expect(() => parseConfig({ type: 'bush', name: 'a' }, 'test.json')).toThrow(/must be one of tree, clump/);
  });

  // The sidecar is written from resolved params, which carry a default for
  // every key including the ones this type does not use. Writing those would
  // produce a file the next run refuses to open.
  it('writes a sidecar that reopens', () => {
    for (const type of ['tree', 'clump'] as const) {
      const saved = toConfig(resolveParams({ type, name: 'a' }));
      expect(() => resolveParams(parseConfig(saved, 'sidecar'))).not.toThrow();
    }
  });

  it('takes its defaults from the type rather than from the tree', () => {
    const clump = clumpParams();
    expect(clump.out).toBe('assets/shared/nature/clumps');
    expect(clump.cullDistance).toBe(50);
    expect(clump.textureSize).toBe(2048);
    // A blade bends along its whole length. The tree's 1.6 holds a trunk rigid.
    expect(clump.bendCurve).toBe(1);
    expect(resolveParams({ name: 'a' }).cullDistance).toBe(160);
  });

  it('ships one cutout piece of two triangles per card segment', () => {
    const { mesh } = build({ cardsPerTuft: 4, cardSegments: 3 });
    expect(mesh.pieces).toHaveLength(1);
    expect(mesh.pieces[0].key).toBe('blade');
    expect(mesh.pieces[0].cutout).toBe(true);
    expect(totalTriangles(mesh)).toBe(4 * 3 * 2);
  });

  // Lean and curve bend a card over, so its tip lands below its own length.
  // Without the normalise, raising cardCurve would quietly shrink the tuft.
  it('lands on the height it was asked for whatever the curve does', () => {
    for (const cardCurve of [0, 30, 70]) {
      const { metrics } = build({ height: 0.4, cardCurve });
      expect(metrics.height).toBeCloseTo(0.4, 5);
    }
  });

  // The engine's open "dark blades" problem, solved in the asset: a card's own
  // normal faces sideways and shades as a wall. The layer sets authoredNormals
  // so nothing mirrors these back inward.
  it('points every normal up rather than along the card', () => {
    const { normals, vertexCount } = build().mesh.pieces[0].attributes;
    for (let i = 0; i < vertexCount; i++) expect(normals[i * 3 + 1]).toBeGreaterThan(0.5);
  });

  it('writes COLOR_0 rigid at the base and free at the tip', () => {
    const { positions, colors, vertexCount } = build({ bendCurve: 1 }).mesh.pieces[0].attributes;
    let lowest = Infinity;
    let highest = -Infinity;

    for (let i = 0; i < vertexCount; i++) {
      if (positions[i * 3 + 1] < lowest) lowest = positions[i * 3 + 1];
      if (positions[i * 3 + 1] > highest) highest = positions[i * 3 + 1];
      // Flutter is the blade's own motion, so it starts at zero where the card
      // meets the ground.
      expect(colors[i * 4 + 2]).toBeGreaterThanOrEqual(0);
    }

    expect(lowest).toBeCloseTo(0, 5);
    const bends = [...colors].filter((_, i) => i % 4 === 0);
    expect(Math.min(...bends)).toBe(0);
    expect(Math.max(...bends)).toBe(1);

    // One phase per card, not one for the whole tuft: blades in lockstep read
    // as a single stiff object.
    const phases = new Set([...colors].filter((_, i) => i % 4 === 1));
    expect(phases.size).toBe(clumpParams().cardsPerTuft);
  });

  it('never addresses a cell nothing painted', () => {
    // Ten stamps land in a 4x4, which leaves six cells blank.
    const cells = 10;
    expect(clumpAtlas({ stamps: new Array(cells) } as never)).toEqual({ grid: 4, cells });

    const { uvs, vertexCount } = build({ cardsPerTuft: 12 }, cells).mesh.pieces[0].attributes;
    const painted = leafCells(clumpParams().textureSize, 4).slice(0, cells);

    for (let i = 0; i < vertexCount; i++) {
      const u = uvs[i * 2];
      const v = uvs[i * 2 + 1];
      expect(
        painted.some((cell) => u >= cell.u0 - 1e-6 && u <= cell.u1 + 1e-6 && v >= cell.v0 - 1e-6 && v <= cell.v1 + 1e-6)
      ).toBe(true);
    }
  });

  it('emits a layer with no impostor and no collider', () => {
    const { metrics } = build();
    const layer = clumpLayer(clumpParams(), metrics);

    // A billboard of a half-metre tuft is fewer pixels than the tile has, and a
    // tuft that stops the player is worse than one they walk through.
    expect(layer.impostor).toBeUndefined();
    expect(layer.collider).toBeUndefined();
    // Grass leans with the ground it grows out of. A tree does not.
    expect(layer.alignToNormal).toBeGreaterThan(0);
    expect(layer.authoredNormals).toBe(true);

    const source = scatterLayerSource(layer);
    expect(source).not.toContain('impostor');
    expect(source).not.toContain('collider');
    expect(source).toContain('authoredNormals: true');
    expect(source).toContain('yOffset:');
  });

  it('writes no _disp map and so no materials.json material', () => {
    expect(heightPieces('clump')).toEqual([]);
    expect(heightPieces('tree')).toEqual(['bark', 'leaf']);
    // Binding a material through materialId replaces every material in the
    // model, so only a piece a displacement path might reach gets one.
    expect(materialPieces('tree')).toEqual(['bark']);
    expect(materialPieces('clump')).toEqual([]);
  });
});

// A leaf grid is 1, 2 or 4 and always divided the image. A clump's is the
// smallest square holding its stamps, so 3 and 5 are ordinary — and a
// fractional rect lands on a non-integer index, where every canvas write is
// silently dropped.
describe('atlas cells on a grid that does not divide the image', () => {
  it('lands every cell on whole texels and leaves no gap between them', () => {
    for (const grid of [3, 5, 7]) {
      const cells = leafCellPixels(2048, grid);
      expect(cells).toHaveLength(grid * grid);

      for (const cell of cells)
        for (const value of [cell.x, cell.y, cell.width, cell.height])
          expect(Number.isInteger(value)).toBe(true);

      // The last cell of a row ends exactly on the edge, so nothing is left
      // unpainted and nothing runs past the image.
      const row = cells.slice(0, grid);
      expect(row[0].x).toBe(0);
      expect(row[grid - 1].x + row[grid - 1].width).toBe(2048);
      for (let i = 1; i < grid; i++) expect(row[i].x).toBe(row[i - 1].x + row[i - 1].width);
    }
  });

  it('keeps the uvs inside the texels that were painted', () => {
    const size = 2048;
    const grid = 3;
    const pixels = leafCellPixels(size, grid);
    const uv = leafCells(size, grid);

    uv.forEach((cell, index) => {
      expect(cell.u0 * size).toBeGreaterThanOrEqual(pixels[index].x);
      expect(cell.u1 * size).toBeLessThanOrEqual(pixels[index].x + pixels[index].width);
      expect(cell.v0 * size).toBeGreaterThanOrEqual(pixels[index].y);
      expect(cell.v1 * size).toBeLessThanOrEqual(pixels[index].y + pixels[index].height);
    });
  });
});

// One candidate per instance buys every tuft in it: the placer samples a
// height, a slope, a biome and a noise field per cell of every chunk, and a
// patch pays that once for all of them.
describe('clump patches', () => {
  const patchParams = (extra: RawConfig = {}): Params =>
    resolveParams({ type: 'clump', name: 'test-patch', tuftsPerModel: 9, patchRadius: 1.4, ...extra });

  const build = (extra: RawConfig = {}) => buildClump(patchParams(extra), CLUMP_CELLS_GENERATED);

  it('grows one tuft per model by default, so an existing clump is unchanged', () => {
    const single = resolveParams({ type: 'clump', name: 'a' });
    expect(single.tuftsPerModel).toBe(1);
    expect(patchRadiusOf(single)).toBe(0);
    expect(buildClump(single, CLUMP_CELLS_GENERATED).metrics.patchRadius).toBe(0);
  });

  it('multiplies the tufts without multiplying the instances', () => {
    const one = buildClump(patchParams({ tuftsPerModel: 1 }), CLUMP_CELLS_GENERATED);
    const nine = build();
    const cards = patchParams().cardsPerTuft * patchParams().cardSegments * 2;

    expect(totalTriangles(one.mesh)).toBe(cards);
    expect(totalTriangles(nine.mesh)).toBe(cards * 9);
  });

  // The model is cut to land on `height` rather than grown and scaled onto it.
  // Scaling would rescale the patch sideways too, so `patchRadius` would stop
  // meaning metres the moment `cardCurve` moved.
  it('lands on its height without rescaling the patch', () => {
    for (const cardCurve of [0, 30, 70]) {
      const { metrics } = build({ height: 0.4, cardCurve });
      expect(metrics.height).toBeCloseTo(0.4, 5);
      expect(metrics.patchRadius).toBe(1.4);
    }
  });

  it('keeps every tuft inside the patch it was given', () => {
    const radius = 1.4;
    const { mesh, metrics } = build({ patchRadius: radius });
    const { positions, vertexCount } = mesh.pieces[0].attributes;

    // Blades reach past the bases they grow from, but only by one tuft's own
    // width. A patch that sprawled further would not tile the cell its
    // footprint claims.
    for (let i = 0; i < vertexCount; i++)
      expect(Math.hypot(positions[i * 3], positions[i * 3 + 2])).toBeLessThan(radius * 1.5);

    expect(metrics.spread).toBeGreaterThan(radius);
  });

  // A patch whose tufts share phases sways as one rigid slab, which is far more
  // obvious at three metres across than a single stiff tuft ever was.
  it('phases every tuft separately, not just every card', () => {
    const { colors } = build().mesh.pieces[0].attributes;
    const phases = new Set([...colors].filter((_, i) => i % 4 === 1));
    expect(phases.size).toBe(9 * patchParams().cardsPerTuft);
  });

  it('refuses a patch wider than the terrain resolves', () => {
    expect(() => patchParams({ patchRadius: CLUMP_MAX_PATCH_RADIUS + 0.1 })).toThrow(/past the .* the terrain resolves/);
    expect(() => patchParams({ tuftsPerModel: 0 })).toThrow(/tuftsPerModel must be within 1\.\.64/);
  });

  it('tiles a patch but spaces a lone tuft, and sinks the patch deeper', () => {
    const single = buildClump(resolveParams({ type: 'clump', name: 'a', footprint: 0 }), CLUMP_CELLS_GENERATED);
    const patch = buildClump(patchParams({ footprint: 0 }), CLUMP_CELLS_GENERATED);

    const soloLayer = clumpLayer(resolveParams({ type: 'clump', name: 'a', footprint: 0 }), single.metrics);
    const patchLayer = clumpLayer(patchParams({ footprint: 0 }), patch.metrics);

    // A patch already carries its own density, so its cells tile it. Tiling a
    // lone tuft would be right for the look and ruinous for the count.
    expect(soloLayer.footprint).toBeCloseTo(single.metrics.spread * 2, 1);
    expect(patchLayer.footprint).toBeCloseTo(patch.metrics.spread * 0.9, 1);

    // Sunk further, because a patch is posed off one height sample and a buried
    // tuft reads better than a floating one.
    expect(patchLayer.yOffset!).toBeLessThan(soloLayer.yOffset!);
  });
});
