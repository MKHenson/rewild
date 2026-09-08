import { atlasPixels, atlasRegions, LEAF_VARIANTS } from './lib/atlas.ts';
import { writeGlb, type GlbTextures } from './lib/glb.ts';
import { buildMesh } from './lib/mesh.ts';
import { argsFromConfig, parseArgs, resolveParams, sameTexture, toConfig } from './lib/params.ts';
import { fbm, gradientNoise, signedFbm, valueNoise, warp, worley } from './lib/noise.ts';
import { buildSkeleton } from './lib/skeleton.ts';
import { colliderFor, scatterLayer } from './lib/templates.ts';

const TEXTURES: GlbTextures = { baseColor: 'a_diff.webp', normal: 'a_nor.webp', arm: 'a_arm.webp' };

function paramsFor(extra: string[] = []) {
  return resolveParams(parseArgs(['--name', 'test-tree', ...extra]));
}

function buildAll(extra: string[] = []) {
  const params = paramsFor(extra);
  const skeleton = buildSkeleton(params);
  return { params, skeleton, mesh: buildMesh(params, skeleton) };
}

function readGltf(buffer: Buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.slice(20, 20 + jsonLength).toString('utf8'));
}

describe('params', () => {
  it('derives a seed from the name so a name alone reproduces a tree', () => {
    expect(paramsFor().seed).toBe(paramsFor().seed);
    expect(resolveParams(parseArgs(['--name', 'other-tree'])).seed).not.toBe(paramsFor().seed);
  });

  it('rejects a name that cannot be a filename or a template key', () => {
    expect(() => resolveParams(parseArgs(['--name', 'Oak Tree']))).toThrow(/lowercase/);
  });

  it('refuses a branch count that would explode', () => {
    expect(() => paramsFor(['--splits', '6', '--branch-levels', '6'])).toThrow(/branches/);
  });

  it('refuses a texture size the leaf grid cannot divide', () => {
    expect(() => paramsFor(['--texture-size', '1000'])).toThrow(/power of two/);
  });
});

describe('config', () => {
  it('reads every option out of a saved tree', () => {
    const params = resolveParams(argsFromConfig({ name: 'saved-tree', height: 17, knots: 0 }, 'test.json'));

    expect(params.name).toBe('saved-tree');
    expect(params.height).toBe(17);
    expect(params.knots).toBe(0);
  });

  it('lets a command line option beat the file', () => {
    const config = argsFromConfig({ name: 'saved-tree', height: 17 }, 'test.json');
    const params = resolveParams({ ...config, ...parseArgs(['--height', '4']) });

    expect(params.height).toBe(4);
    expect(params.name).toBe('saved-tree');
  });

  it('rejects an unknown option rather than dropping it', () => {
    // The file exists to be hand-edited, so a silently ignored typo is a change
    // that appears not to have worked.
    expect(() => argsFromConfig({ name: 'a', hieght: 9 }, 'test.json')).toThrow(/unknown option 'hieght'/);
  });

  it('ignores the config key a saved tree names itself with', () => {
    expect(() => argsFromConfig({ name: 'a', config: 'a.tree.json' }, 'test.json')).not.toThrow();
  });

  it('refuses anything that is not a JSON object', () => {
    expect(() => argsFromConfig([1, 2], 'test.json')).toThrow(/JSON object/);
    expect(() => argsFromConfig('nope', 'test.json')).toThrow(/JSON object/);
  });

  it('writes a sidecar that reads back as the same tree', () => {
    const first = paramsFor(['--height', '13', '--splits', '4']);
    const round = resolveParams(argsFromConfig(toConfig(first), 'test.json'));

    expect(round).toEqual(first);
    expect(toConfig(first)).not.toHaveProperty('config');
  });
});

describe('texture reuse', () => {
  it('needs --config to watch anything', () => {
    expect(() => paramsFor(['--watch'])).toThrow(/--watch needs --config/);
  });

  it('reuses the texture across a mesh edit and rebuilds it across a texture edit', () => {
    const base = paramsFor([]);

    expect(sameTexture(base, paramsFor(['--height', '20']))).toBe(true);
    expect(sameTexture(base, paramsFor(['--splits', '5']))).toBe(true);
    expect(sameTexture(base, paramsFor(['--knots', '1']))).toBe(false);
    expect(sameTexture(base, paramsFor(['--groove-depth', '0.5']))).toBe(false);
    expect(sameTexture(base, paramsFor(['--seed', '42']))).toBe(false);
  });

});

describe('skeleton', () => {
  it('stands on the origin at exactly the requested height', () => {
    const { skeleton } = buildAll(['--height', '9']);
    const heights = skeleton.branches.flatMap((branch) => branch.points.map((point) => point.p[1]));

    expect(Math.min(...heights)).toBeCloseTo(0, 5);
    expect(Math.max(...heights)).toBeCloseTo(9, 5);
  });

  it('hangs leaves off the deepest generations, not only the tips', () => {
    const shallow = buildAll(['--leaf-levels', '1']).skeleton.branches.filter((branch) => branch.bearsLeaves);
    const deep = buildAll(['--leaf-levels', '3']).skeleton.branches.filter((branch) => branch.bearsLeaves);

    expect(deep.length).toBeGreaterThan(shallow.length);
    expect(shallow.every((branch) => branch.children.length === 0)).toBe(true);
  });

  it('refuses more leaf levels than the tree has generations', () => {
    expect(() => paramsFor(['--branch-levels', '2', '--leaf-levels', '4'])).toThrow(/leaf-levels/);
  });

  it('pulls the crown in when droop is negative', () => {
    // Split angles compound with depth, so upward attraction is the only thing
    // stopping a deep tree from fanning into a disc.
    const spreading = buildAll(['--droop', '30']).skeleton.canopy.spread;
    const upright = buildAll(['--droop', '-30']).skeleton.canopy.spread;

    expect(upright).toBeLessThan(spreading);
  });

  it('keeps branches next to each other in height far apart in angle', () => {
    // An even fraction of a turn per child ties azimuth to attach height and
    // winds the whorl up one side as a tight helix.
    const { skeleton } = buildAll(['--splits', '8', '--split-spread', '0.9', '--branch-levels', '1']);
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
    expect(facingAgreement(buildAll(['--leaf-normal-mode', 'card']).mesh.leaves)).toBe(1);
  });
});

describe('atlas', () => {
  it('keeps the bark clear of every leaf cell', () => {
    const regions = atlasRegions(1024);
    expect(regions.bark.v1).toBeLessThan(0.5);
    for (const cell of regions.leaves) expect(cell.v0).toBeGreaterThan(0.5);
    expect(regions.leaves).toHaveLength(LEAF_VARIANTS);
  });

  it('lays the leaf cells out square', () => {
    for (const size of [512, 1024, 2048])
      for (const cell of atlasPixels(size).leaves) expect(cell.width).toBe(cell.height);
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
    const build = (extra: string[]) => {
      const { params, mesh } = buildAll(extra);
      return writeGlb({ name: params.name, ...mesh, textures: TEXTURES, alphaCutoff: 0.45 });
    };

    expect(build(['--seed', '7']).equals(build(['--seed', '7']))).toBe(true);
    expect(build(['--seed', '7']).equals(build(['--seed', '8']))).toBe(false);
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
