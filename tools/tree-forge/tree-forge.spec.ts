import { leafCellPixels, leafCells } from './lib/atlas.ts';
import { writeGlb, type GlbTextureSet } from './lib/glb.ts';
import { buildMesh } from './lib/mesh.ts';
import { parseConfig, resolveParams, sameTexture, toConfig, type Params, type RawConfig } from './lib/params.ts';
import { fbm, gradientNoise, signedFbm, valueNoise, warp, worley } from './lib/noise.ts';
import { buildSkeleton } from './lib/skeleton.ts';
import { LOOK } from './lib/look.ts';
import { LEAF_GRID_GENERATED } from './lib/sources.ts';
import { colliderFor, scatterLayer, scatterLayerSource } from './lib/templates.ts';

const TEXTURES: GlbTextureSet = {
  bark: { baseColor: 'a_bark_diff.webp', normal: 'a_bark_nor.webp', arm: 'a_bark_arm.webp' },
  leaves: { baseColor: 'a_leaf_diff.webp', normal: 'a_leaf_nor.webp', arm: 'a_leaf_arm.webp' },
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
  it('derives a seed from the name so a name alone reproduces a tree', () => {
    expect(paramsFor().seed).toBe(paramsFor().seed);
    expect(resolveParams({ name: 'other-tree' }).seed).not.toBe(paramsFor().seed);
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
    const base = paramsFor([]);

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
    const bark = [...mesh.bark.colors].filter((_, i) => i % 4 === 0);
    const leaves = [...mesh.leaves.colors].filter((_, i) => i % 4 === 0);

    expect(Math.min(...bark)).toBeCloseTo(0, 3);
    expect(Math.max(...leaves)).toBeGreaterThan(Math.max(...bark));
    expect(Math.max(...leaves)).toBeLessThanOrEqual(1);
  });

  it('flutters leaves only, and never the bark', () => {
    const { mesh } = buildAll();
    const barkFlutter = [...mesh.bark.colors].filter((_, i) => i % 4 === 2);
    const leafFlutter = [...mesh.leaves.colors].filter((_, i) => i % 4 === 2);

    expect(Math.max(...barkFlutter)).toBe(0);
    expect(Math.min(...leafFlutter)).toBe(0);
    expect(Math.max(...leafFlutter)).toBe(1);
  });

  it('gives each limb its own phase, constant across that limb', () => {
    const { mesh, skeleton } = buildAll();
    const phases = new Set([...mesh.bark.colors].filter((_, i) => i % 4 === 1));
    const limbs = new Set(skeleton.branches.map((branch) => branch.clusterId));

    expect(phases.size).toBe(limbs.size);
  });
});

describe('winding', () => {
  /** Share of triangles whose index order agrees with their vertex normals. */
  function facingAgreement(attributes: ReturnType<typeof buildMesh>['bark']): number {
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
    expect(facingAgreement(buildAll().mesh.bark)).toBe(1);
  });

  it('winds leaf cards to face the way their card points', () => {
    // Measured against the card normal, because the default canopy normals
    // deliberately do not follow the card.
    expect(facingAgreement(buildAll({ leafNormalMode: 'card' }).mesh.leaves)).toBe(1);
  });
});

describe('leaf normals', () => {
  function leafNormals(mode: string) {
    const { skeleton, mesh } = buildAll({ leafNormalMode: mode });
    const { normals, positions, vertexCount } = mesh.leaves;
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
    const { positions, uvs } = buildMesh(params, skeleton, LEAF_GRID_GENERATED).bark;
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
    const along = (ring: number) => mesh.bark.uvs[ring * stride * 2 + 1];

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
    const buffer = writeGlb({ name: params.name, ...mesh, textures: TEXTURES, alphaCutoff: 0.45 });

    expect(buffer.readUInt32LE(0)).toBe(0x46546c67);
    expect(buffer.readUInt32LE(8)).toBe(buffer.byteLength);

    const jsonLength = buffer.readUInt32LE(12);
    expect(jsonLength % 4).toBe(0);
    expect(buffer.readUInt32LE(20 + jsonLength)).toBe(buffer.byteLength - 20 - jsonLength - 8);
  });

  it('splits opaque bark from cutout leaves', () => {
    const { params, mesh } = buildAll();
    const gltf = readGltf(writeGlb({ name: params.name, ...mesh, textures: TEXTURES, alphaCutoff: 0.4 }));
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
    const gltf = readGltf(writeGlb({ name: params.name, ...mesh, textures: TEXTURES, alphaCutoff: 0.45 }));

    for (const primitive of gltf.meshes[0].primitives) {
      expect(primitive.attributes.COLOR_0).toBeDefined();
      expect(gltf.accessors[primitive.attributes.COLOR_0].type).toBe('VEC4');
      expect(primitive.attributes.TANGENT).toBeUndefined();
    }
  });

  it('reproduces a tree byte for byte from the same seed', () => {
    const build = (extra: RawConfig) => {
      const { params, mesh } = buildAll(extra);
      return writeGlb({ name: params.name, ...mesh, textures: TEXTURES, alphaCutoff: 0.45 });
    };

    expect(build({ seed: '7' }).equals(build({ seed: '7' }))).toBe(true);
    expect(build({ seed: '7' }).equals(build({ seed: '8' }))).toBe(false);
  });
});

describe('scatter layer', () => {
  it('measures the trunk capsule off the trunk it stands in', () => {
    const { params, skeleton } = buildAll();
    const collider = colliderFor(params, skeleton);

    // ScatterCollider is a union and most of its members are optional, so the
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
