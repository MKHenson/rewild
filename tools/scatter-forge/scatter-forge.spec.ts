import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { columnOf, layoutAtlas, leafCellPixels, leafCells } from './lib/atlas.ts';
import { writeGlb, type GlbTextureSet } from './lib/glb.ts';
import {
  boundsOf,
  buildMesh,
  pieceOf,
  totalTriangles,
  type BarkTile,
  type ForgeMesh,
  type MeshAttributes,
} from './lib/mesh.ts';
import {
  barkCanvasSize,
  CLUMP_MAX_PATCH_RADIUS,
  hasImpostor,
  hasStem,
  impostorDistance,
  parseConfig,
  resolveParams,
  sameTexture,
  tierParams,
  toConfig,
  type Params,
  type RawConfig,
} from './lib/params.ts';
import { fbm, gradientNoise, gradientNoise3, signedFbm, valueNoise, warp, worley, worley3 } from './lib/noise.ts';
import { randomSeed } from './lib/rng.ts';
import { renderComparison, renderPreview } from './lib/preview.ts';
import type { Canvas } from './lib/textures.ts';
import { buildSkeleton } from './lib/skeleton.ts';
import { LOOK } from './lib/look.ts';
import { clumpAtlas, CLUMP_CELLS_GENERATED, crownAtlas, CROWN_CELLS_GENERATED, LEAF_GRID_GENERATED } from './lib/sources.ts';
import {
  clumpLayer,
  colliderFor,
  crownLayer,
  geometryEntry,
  pebbleLayer,
  rockLayer,
  scatterLayer,
  scatterLayerEntry,
  scatterLayerKey,
  writeScatterLayer,
} from './lib/templates.ts';
import { buildClump, patchRadiusOf } from './lib/clump.ts';
import { buildCrown } from './lib/crown.ts';
import { buildPebbleCluster, packPebbles } from './lib/pebbles.ts';
import { buildRock, chartAtlas, chartOrigin, chartUv, crackMask, cubePoint, FACES, gutterOf, ROCK_CHART_COLUMNS, rockAtlas, rockChartPx, scoopOf, surfaceAt } from './lib/rock.ts';
import { buildPebbleCanvases, buildStoneCanvas } from './lib/stone.ts';
import { platesInto } from './lib/plates.ts';
import { heightPieces, materialPieces } from './lib/pieces.ts';

const TEXTURES: GlbTextureSet = {
  bark: { baseColor: 'a_bark_diff.webp', normal: 'a_bark_nor.webp', arm: 'a_bark_arm.webp' },
  leaf: { baseColor: 'a_leaf_diff.webp', normal: 'a_leaf_nor.webp', arm: 'a_leaf_arm.webp' },
};

/** The layouts a set with no accents is cut on, as the CLI would derive them. */
const TREE_ATLAS = layoutAtlas(LEAF_GRID_GENERATED * LEAF_GRID_GENERATED, []);
const CLUMP_ATLAS = layoutAtlas(CLUMP_CELLS_GENERATED, []);
const CROWN_ATLAS = layoutAtlas(CROWN_CELLS_GENERATED, []);

const CROWN_TEXTURES: GlbTextureSet = {
  bark: TEXTURES.bark,
  frond: { baseColor: 'a_frond_diff.webp', normal: 'a_frond_nor.webp', arm: 'a_frond_arm.webp' },
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

function buildAll(extra: RawConfig = {}, look: Partial<Params> = {}, bark: BarkTile | null = null) {
  const params = paramsFor(extra, look);
  const skeleton = buildSkeleton(params);
  return { params, skeleton, mesh: buildMesh(params, skeleton, TREE_ATLAS, bark) };
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
      parseConfig({ name: 'saved-tree', barkTint: '#ffffff', barkTile: 9 }, 'test.json')
    );

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

    // Any source may pick its sets by pattern; the loader is what holds bark
    // to one.
    expect(paramsFor({ leaves: ['palm/green-*', 'oak/leaf-?'] }).leaves).toEqual(['palm/green-*', 'oak/leaf-?']);
    expect(paramsFor({ bark: ['oak/oak-01'] }).bark).toEqual(['oak/oak-01']);
    expect(() => paramsFor({ leaves: ['palm/'] })).toThrow(/followed by \/pattern/);
    expect(() => paramsFor({ leaves: ['palm/a/b'] })).toThrow(/followed by \/pattern/);
    expect(() => paramsFor({ bark: ['oak/a/b'] })).toThrow(/followed by \/pattern/);
  });

  it('sizes the bark map on its own key, following textureSize at 0', () => {
    expect(barkCanvasSize(paramsFor({ textureSize: 512 }))).toEqual({ width: 256, height: 512 });
    expect(barkCanvasSize(paramsFor({ textureSize: 512, barkTextureSize: 2048 }))).toEqual({ width: 1024, height: 2048 });
    expect(() => paramsFor({ barkTextureSize: 300 })).toThrow(/barkTextureSize must be a power of two/);
    expect(() => paramsFor({ barkTextureSize: 128, barkAspect: 4 })).toThrow(/barkTextureSize 128 at barkAspect 4/);
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
    expect(sameTexture(base, paramsFor({ barkAspect: '1' }))).toBe(false);
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

describe('whorls', () => {
  // A conifer, held still: no curve, no droop and no split variance, so the
  // placement itself is what the numbers below measure.
  const WHORLED: RawConfig = {
    branchModel: 'whorl',
    whorls: 6,
    splits: 4,
    whorlTaper: 0.25,
    splitSpread: 0.9,
    splitAngle: 80,
    splitVariance: 0,
    branchLevels: 1,
    leafLevels: 1,
    lengthRatio: 0.2,
    curve: 0,
    droop: 0,
    height: 20,
  };

  /** The limbs in creation order, which is whorl by whorl from the ground up. */
  function limbsOf(extra: RawConfig = {}) {
    return buildAll({ ...WHORLED, ...extra }).skeleton.branches.filter((branch) => branch.level === 1);
  }

  it('hangs every limb off a trunk that never forks', () => {
    const { skeleton } = buildAll(WHORLED);

    expect(skeleton.branches[0].children).toHaveLength(6 * 4);

    // A fork tree's first child is a leader leaving at a quarter of splitAngle,
    // which is what carries the trunk on past the fork. A whorl has none: every
    // limb leaves at splitAngle, so none of them is near vertical.
    for (const limb of skeleton.branches.filter((branch) => branch.level === 1))
      expect(limb.points[0].dir[1]).toBeLessThan(Math.cos(70 * (Math.PI / 180)));
  });

  it('places one whorl at one height, evenly around the trunk', () => {
    const ring = limbsOf().slice(0, 4);

    for (const limb of ring) expect(limb.points[0].p[1]).toBeCloseTo(ring[0].points[0].p[1], 5);

    const azimuths = ring.map((limb) => {
      const start = limb.points[0].p;
      const next = limb.points[1].p;
      return (Math.atan2(next[2] - start[2], next[0] - start[0]) * 180) / Math.PI;
    });

    // A quarter turn apart at four per whorl, give or take the jitter, measured
    // as the shorter arc because the trunk's turn and the world's are opposite
    // hands. The golden angle a fork uses would leave 137 degrees between them.
    for (let i = 1; i < azimuths.length; i++) {
      const turn = (((azimuths[i] - azimuths[i - 1]) % 360) + 360) % 360;
      const gap = Math.min(turn, 360 - turn);
      expect(gap).toBeGreaterThan(65);
      expect(gap).toBeLessThan(115);
    }
  });

  it('climbs the trunk at one interval, leaving a bare foot and a leader', () => {
    const bases = limbsOf().map((limb) => limb.points[0].p[1]);
    const step = (20 * 0.9) / 6;

    // splitSpread is the fraction of the trunk the whorls climb, so what is
    // left below the lowest is the rest of it.
    expect(Math.min(...bases)).toBeCloseTo(20 * (1 - 0.9), 3);
    // And the leading shoot above the top whorl is one interval of trunk.
    expect(20 - Math.max(...bases)).toBeCloseTo(step, 3);
  });

  it('shortens each whorl as it climbs, which is the cone', () => {
    const limbs = limbsOf();
    const mean = (ring: number) =>
      limbs.slice(ring * 4, ring * 4 + 4).reduce((sum, limb) => sum + limb.length, 0) / 4;

    // Lengths carry a 15% jitter each, so this reads the ring means rather
    // than two limbs.
    expect(mean(5) / mean(0)).toBeGreaterThan(0.15);
    expect(mean(5) / mean(0)).toBeLessThan(0.35);
    expect(buildAll({ ...WHORLED, whorlTaper: 0.9 }).skeleton.canopy.spread).toBeGreaterThan(
      buildAll(WHORLED).skeleton.canopy.spread
    );
  });

  it('carries the collider the whole way up an undivided trunk', () => {
    // The proxy stops at the first fork, and there is none: stopping at the
    // lowest whorl instead would leave a spruce with a stub of a collider.
    expect(buildAll(WHORLED).skeleton.trunk.splitHeight).toBeCloseTo(20, 5);
  });

  it('leaves a fork tree alone, whatever the whorl keys say', () => {
    expect(buildAll({ whorls: 12, whorlTaper: 0.4 }).skeleton).toEqual(buildAll().skeleton);
  });

  it('counts the whorls into the branch cap', () => {
    // 6^4 is 1,296 branches as a fork and 15,552 over twelve whorls.
    expect(() => paramsFor({ splits: 6, branchLevels: 4 })).not.toThrow();
    expect(() =>
      paramsFor({ branchModel: 'whorl', whorls: 12, splits: 6, branchLevels: 4 })
    ).toThrow(/12 whorls is 15552 branches/);
  });

  it('holds the model and its numbers to what the placer can grow', () => {
    expect(() => paramsFor({ branchModel: 'spiral' })).toThrow(/branchModel must be one of fork, whorl/);
    expect(() => paramsFor({ branchModel: 'whorl', whorls: 0 })).toThrow(/whorls must be within 1..24/);
    // At 0 the spire ends in nothing; past 1 the tree widens as it climbs.
    expect(() => paramsFor({ branchModel: 'whorl', whorlTaper: 0 })).toThrow(/whorlTaper/);
    expect(() => paramsFor({ branchModel: 'whorl', whorlTaper: 1.2 })).toThrow(/whorlTaper/);
  });

  it('belongs to a tree alone', () => {
    expect(() => parseConfig({ name: 'a', type: 'clump', branchModel: 'whorl' }, 'test.json')).toThrow(
      /applies to tree, not to type 'clump'/
    );
  });
});

describe('trunk relief', () => {
  // Bark for the trunk alone, so the piece is the trunk and its rings can be
  // read straight out of the buffer.
  const TRUNK: RawConfig = { barkLevels: 0, trunkSides: 24, trunkSegments: 10, trunkRadius: 1, trunkTaper: 0.5 };

  /** Ring `index` of the trunk: its centre, and each vertex's offset from it.
   *
   *  Measured in three dimensions about the ring's own centre rather than about
   *  the world axis in plan. A trunk curves and may wander, so its rings are
   *  neither horizontal nor centred on the origin, and a radius read off the
   *  x/z plane carries the tilt as a wobble that is not there. */
  function ringOf(mesh: ForgeMesh, sides: number, index: number) {
    const positions = pieceOf(mesh, 'bark').positions;
    const base = index * (sides + 1) * 3;
    const vertex = (j: number): [number, number, number] => [
      positions[base + j * 3],
      positions[base + j * 3 + 1],
      positions[base + j * 3 + 2],
    ];

    const centre: [number, number, number] = [0, 0, 0];
    for (let j = 0; j < sides; j++)
      for (let axis = 0; axis < 3; axis++) centre[axis] += vertex(j)[axis] / sides;

    const spokes = Array.from({ length: sides }, (_, j) => {
      const point = vertex(j);
      return [point[0] - centre[0], point[1] - centre[1], point[2] - centre[2]] as [number, number, number];
    });

    return { centre, spokes, radii: spokes.map((spoke) => Math.hypot(...spoke)) };
  }

  const ringRadii = (mesh: ForgeMesh, sides: number, index: number) => ringOf(mesh, sides, index).radii;

  it('builds a plain tube when neither key is set', () => {
    const radii = ringRadii(buildAll(TRUNK).mesh, 24, 2);
    for (const radius of radii) expect(radius).toBeCloseTo(radii[0], 6);
  });

  it('spends its polygons on the trunk alone', () => {
    // Rings are trunkSegments plus the degenerate cap, each of trunkSides + 1
    // vertices, and the branches carry none of the cost.
    expect(pieceOf(buildAll(TRUNK).mesh, 'bark').vertexCount).toBe(11 * 25);
    expect(pieceOf(buildAll({ ...TRUNK, trunkSides: 8, trunkSegments: 4 }).mesh, 'bark').vertexCount).toBe(5 * 9);
    // 0 is what the tree built before these keys existed: the branch tube's.
    expect(pieceOf(buildAll({ ...TRUNK, trunkSides: 0, trunkSegments: 0, radialSegments: 8, segments: 5 }).mesh, 'bark').vertexCount).toBe(8 * 9);
  });

  it('cuts the flutes in rather than swelling them out', () => {
    const plain = ringRadii(buildAll(TRUNK).mesh, 24, 2);
    const fluted = ringRadii(buildAll({ ...TRUNK, trunkFlute: 0.2 }).mesh, 24, 2);

    const swing = (Math.max(...fluted) - Math.min(...fluted)) / plain[0];
    expect(swing).toBeGreaterThan(0.08);
    // Never deeper than the key says, which is what makes it mean something.
    expect(swing).toBeLessThanOrEqual(0.2 + 1e-6);
    // A fluted trunk still measures its own radius across the faces, so a tree
    // does not quietly get fatter when it is given relief.
    expect(Math.max(...fluted)).toBeLessThanOrEqual(plain[0] + 1e-6);
  });

  it('shades the flutes, rather than lighting them as a round pole', () => {
    // A groove whose walls keep the radial normal is a groove you cannot see.
    const tilt = (extra: RawConfig) => {
      const mesh = buildAll({ ...TRUNK, ...extra }).mesh;
      const normals = pieceOf(mesh, 'bark').normals;
      const { spokes, radii } = ringOf(mesh, 24, 2);
      let worst = 0;

      for (let j = 0; j < 24; j++) {
        const at = (2 * 25 + j) * 3;
        const dot =
          (spokes[j][0] / radii[j]) * normals[at] +
          (spokes[j][1] / radii[j]) * normals[at + 1] +
          (spokes[j][2] / radii[j]) * normals[at + 2];
        worst = Math.max(worst, Math.acos(Math.min(1, Math.max(-1, dot))));
      }

      return (worst * 180) / Math.PI;
    };

    expect(tilt({ trunkFlute: 0.2 })).toBeGreaterThan(10);
    expect(tilt({})).toBeLessThan(1);
  });

  it('swells the foot and is done with it by a fifth of the way up', () => {
    const flared = buildAll({ ...TRUNK, trunkFlare: 0.5 }).mesh;

    expect(ringRadii(flared, 24, 0)[0]).toBeCloseTo(1.5, 5);
    // Ring 3 of 10 is above the flare, and stands where an unflared trunk does.
    expect(ringRadii(flared, 24, 3)[0]).toBeCloseTo(ringRadii(buildAll(TRUNK).mesh, 24, 3)[0], 5);
  });

  it('strays the centre line, and the limbs follow it', () => {
    // No curve, so the straight climb it strays from is actually straight.
    const straight: RawConfig = { height: 20, curve: 0 };
    const { skeleton } = buildAll({ ...straight, trunkWander: 1 });
    const trunk = skeleton.branches[0];
    const top = trunk.points[trunk.points.length - 1].p;
    const plainTop = buildAll(straight).skeleton.branches[0].points.at(-1)!.p;

    expect(Math.hypot(top[0], top[2])).toBeGreaterThan(0.3);
    expect(Math.hypot(plainTop[0], plainTop[2])).toBeCloseTo(0, 6);
    // Planted where it was planted.
    expect(Math.hypot(trunk.points[0].p[0], trunk.points[0].p[2])).toBeCloseTo(0, 6);

    // A limb whose base sat on the old axis would hang in the air beside the
    // trunk. Every one of them is still inside the wood it grows from.
    for (const limb of skeleton.branches.filter((branch) => branch.level === 1)) {
      const base = limb.points[0].p;
      const nearest = Math.min(
        ...trunk.points.map((point) => Math.hypot(point.p[0] - base[0], point.p[1] - base[1], point.p[2] - base[2]))
      );
      expect(nearest).toBeLessThan(trunk.baseRadius);
    }
  });

  it('holds the keys to what the mesh can actually show', () => {
    expect(() => paramsFor({ trunkFlute: 0.6 })).toThrow(/trunkFlute must be within 0..0.5/);
    expect(() => paramsFor({ trunkFlare: -1 })).toThrow(/trunkFlare/);
    expect(() => paramsFor({ trunkWander: -1 })).toThrow(/trunkWander/);
    expect(() => paramsFor({ trunkSides: 2 })).toThrow(/trunkSides must be 0, or within 3..48/);
    expect(() => paramsFor({ trunkSegments: 1 })).toThrow(/trunkSegments must be 0, or within 2..64/);

    // A flute needs a ring round enough to fold. Asking for one on an 8-sided
    // trunk is a key that would silently do nothing.
    expect(() => paramsFor({ trunkFlute: 0.2 })).toThrow(/needs a rounder trunk than 8 sides/);
    expect(() => paramsFor({ trunkFlute: 0.2, trunkSides: 16 })).not.toThrow();
  });

  it("shapes a crown's stem with the same keys", () => {
    // The stem is one branch on a skeleton of its own and goes through the
    // tree's own bark builder, so the trunk keys reach it unchanged.
    const stem = (extra: RawConfig = {}) =>
      buildCrown(
        resolveParams({ type: 'crown', name: 'test-palm', stemHeight: 8, trunkRadius: 0.5, trunkSides: 20, trunkSegments: 12, ...extra }),
        CROWN_ATLAS
      ).mesh;

    expect(pieceOf(stem(), 'bark').vertexCount).toBe(13 * 21);

    const plain = ringRadii(stem(), 20, 2);
    const fluted = ringRadii(stem({ trunkFlute: 0.2 }), 20, 2);
    expect((Math.max(...fluted) - Math.min(...fluted)) / plain[0]).toBeGreaterThan(0.08);

    // And the wander, which the rosette follows because it rides the stem top.
    const straight = pieceOf(stem(), 'bark').positions;
    const strayed = pieceOf(stem({ trunkWander: 0.8 }), 'bark').positions;
    expect(Math.hypot(strayed.at(-3)! - straight.at(-3)!, strayed.at(-1)! - straight.at(-1)!)).toBeGreaterThan(0.1);

    // The rosette moves with the stem top but stays upright: the fronds fan
    // about the vertical, not the lean or the last wandered segment.
    const tilt = (extra: RawConfig) => {
      const frond = pieceOf(stem({ stemLean: 0, frondCount: 1, frondAngle: 90, frondVariance: 0, cardCurve: 0, cardSegments: 1, ...extra }), 'frond');
      const p = frond.positions;
      const base = [(p[0] + p[3]) / 2, (p[1] + p[4]) / 2, (p[2] + p[5]) / 2];
      const tip = [(p[6] + p[9]) / 2, (p[7] + p[10]) / 2, (p[8] + p[11]) / 2];
      const d = [tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]];
      return Math.acos(d[1] / Math.hypot(d[0], d[1], d[2]));
    };
    expect(tilt({})).toBeCloseTo(0, 5);
    expect(tilt({ trunkWander: 0.8 })).toBeCloseTo(0, 5);
    expect(tilt({ stemLean: 20 })).toBeCloseTo(0, 5);
    expect(tilt({ stemLean: 20, trunkWander: 0.8 })).toBeCloseTo(0, 5);
  });

  it('deals the frond variance out evenly rather than drawing it', () => {
    // Twelve fronds over 120 degrees: one lands in every 10 degree slice, on
    // any seed. Independent draws would leave a slice empty as often as not.
    for (const seed of [1, 2, 3, 4, 5]) {
      const params = resolveParams({
        type: 'crown',
        name: 'test-palm',
        seed,
        stemHeight: 8,
        stemLean: 0,
        frondCount: 12,
        frondAngle: 15,
        frondVariance: 60,
        cardCurve: 0,
        cardSegments: 1,
      });
      const p = pieceOf(buildCrown(params, CROWN_ATLAS).mesh, 'frond').positions;
      const slices = new Set<number>();
      for (let frond = 0; frond < 12; frond++) {
        const o = frond * 12;
        const dx = (p[o + 6] + p[o + 9] - p[o] - p[o + 3]) / 2;
        const dy = (p[o + 7] + p[o + 10] - p[o + 1] - p[o + 4]) / 2;
        const dz = (p[o + 8] + p[o + 11] - p[o + 2] - p[o + 5]) / 2;
        const elevation = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
        slices.add(Math.floor((elevation + 45) / 10));
      }
      expect([...slices].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    }
  });

  it('swells a stem under the same key, from a default of its own', () => {
    const foot = (extra: RawConfig) =>
      ringRadii(
        buildCrown(
          resolveParams({ type: 'crown', name: 'test-palm', stemHeight: 8, trunkRadius: 0.5, trunkSides: 20, ...extra }),
          CROWN_ATLAS
        ).mesh,
        20,
        0
      )[0];

    // A trunk is mostly a bare pole and defaults to no flare; a stem never is.
    expect(resolveParams({ type: 'crown', name: 'a' }).trunkFlare).toBe(0.25);
    expect(resolveParams({ name: 'a' }).trunkFlare).toBe(0);
    expect(foot({ trunkFlare: 0.6 })).toBeCloseTo(0.5 * 1.6, 5);
    expect(foot({ trunkFlare: 0 })).toBeCloseTo(0.5, 5);
  });

  it('leaves a stemless crown out of it', () => {
    // A fern takes the tube keys and reads none of them. There is nothing for a
    // flute to cut into, so the sides check does not hold it either.
    const fern = buildCrown(
      resolveParams({ type: 'crown', name: 'test-fern', stemHeight: 0, trunkFlute: 0.3, trunkWander: 1 }),
      CROWN_ATLAS
    );

    expect(fern.mesh.pieces.map((piece) => piece.key)).toEqual(['frond']);
  });

  it('lets a tier drop the sides the model paid for', () => {
    // The tier is coarsening on purpose, so the flute check does not hold it:
    // a blocky flute at 90m is the trade it asked for.
    expect(() =>
      paramsFor({ trunkFlute: 0.2, trunkSides: 24, lods: [{ distance: 60, trunkSides: 8 }] })
    ).not.toThrow();

    expect(() => parseConfig({ name: 'a', type: 'clump', trunkSides: 8 }, 'test.json')).toThrow(
      /applies to tree, crown, not to type 'clump'/
    );
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
    expect(Math.max(...leafFlutter)).toBeGreaterThan(0.6);
    expect(Math.max(...leafFlutter)).toBeLessThanOrEqual(1);
  });

  it('gives each leaf card its own phase in A, and the bark none', () => {
    const { mesh } = buildAll();
    const barkPhase = new Set([...pieceOf(mesh, 'bark').colors].filter((_, i) => i % 4 === 3));
    const leafColors = pieceOf(mesh, 'leaf').colors;
    const cardPhases = new Set<number>();

    for (let v = 0; v < leafColors.length; v += 16) {
      for (let corner = 1; corner < 4; corner++)
        expect(leafColors[v + corner * 4 + 3]).toBe(leafColors[v + 3]);
      cardPhases.add(leafColors[v + 3]);
    }

    expect([...barkPhase]).toEqual([1]);
    expect(cardPhases.size).toBeGreaterThan(leafColors.length / 16 / 2);
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
    const { positions, uvs } = pieceOf(buildMesh(params, skeleton, TREE_ATLAS), 'bark');
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

  it('advances length by barkAspect circumferences per image', () => {
    // Nothing authors the bark's scale any more. The ring maps once across the
    // image, so the image's width is one circumference; its height is that many
    // circumferences again, and length has to advance by all of them or the
    // texture is not square on the trunk.
    //
    // This is the whole mechanism by which a taller map is less repetitive
    // rather than merely sharper, so it is asserted at both shapes.
    for (const barkAspect of [1, 2, 4]) {
      const { params, skeleton, mesh } = buildAll({ barkAspect });
      const trunk = skeleton.branches[0];
      const stride = Math.max(3, params.radialSegments - trunk.level) + 1;
      const along = (ring: number) => pieceOf(mesh, 'bark').uvs[ring * stride * 2 + 1];

      for (let ring = 1; ring < trunk.points.length; ring++) {
        const span = trunk.points[ring].dist - trunk.points[ring - 1].dist;
        const radius = (trunk.points[ring].radius + trunk.points[ring - 1].radius) / 2;
        expect(along(ring) - along(ring - 1)).toBeCloseTo(span / (barkAspect * 2 * Math.PI * radius), 5);
      }
    }
  });

  it('repeats an authored tile by its own size in metres', () => {
    // A generated pattern has no size, so it wraps once around anything. An
    // authored one was photographed at a stated width, and keeping that width
    // is the whole point of declaring it: a thick branch shows several tiles,
    // a twig shows one.
    const tile = { metresAround: 1, aspect: 2 };
    const { params, skeleton, mesh } = buildAll({ height: 20, trunkRadius: 1.2, barkLevels: 0 }, {}, tile);
    const stride = Math.max(3, params.radialSegments) + 1;
    const uvs = pieceOf(mesh, 'bark').uvs;

    // 2 x pi x 1.2 is 7.54m of circumference, so eight tiles of 1m fit best.
    const turns = uvs[(stride - 1) * 2];
    expect(turns).toBe(8);

    // And the tile stays undistorted: eight of them around means the length of
    // one is a whole tile's height, 7.54 / 8 x 2 metres of trunk.
    const trunk = skeleton.branches[0];
    const along = (ring: number) => uvs[ring * stride * 2 + 1];
    const tileAlong = ((2 * Math.PI * 1.2) / 8) * 2;

    for (let ring = 1; ring < trunk.points.length; ring++) {
      const span = trunk.points[ring].dist - trunk.points[ring - 1].dist;
      const radius = (trunk.points[ring].radius + trunk.points[ring - 1].radius) / 2;
      expect(along(ring) - along(ring - 1)).toBeCloseTo((span * (1.2 / radius)) / tileAlong, 5);
    }
  });

  it('halves the repeat up a trunk for every doubling of barkAspect', () => {
    // The symptom the key exists for: the same plate coming round again up a
    // trunk. Measured as the largest v the trunk's own rings reach.
    const repeats = (barkAspect: number) => {
      const { params, skeleton, mesh } = buildAll({ barkAspect, height: 42, trunkRadius: 1.3 });
      const stride = Math.max(3, params.radialSegments - 0) + 1;
      const uvs = pieceOf(mesh, 'bark').uvs;
      const rings = skeleton.branches[0].points.length;
      return uvs[(rings - 1) * stride * 2 + 1];
    };

    expect(repeats(2)).toBeCloseTo(repeats(1) / 2, 5);
    expect(repeats(4)).toBeCloseTo(repeats(1) / 4, 5);
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
    expect(impostorDistance(paramsFor({ cullDistance: '800', impostor: { fromDistance: 192 } }))).toBe(192);
  });

  it('takes the block keyed as the layer keys it, and fills what the file leaves out', () => {
    expect(paramsFor({ impostor: { views: 12 } }).impostor).toEqual({ fromDistance: 0, views: 12, tileSize: 128 });
    expect(paramsFor({}).impostor).toEqual({ fromDistance: 0, views: 8, tileSize: 128 });
    expect(() => parseConfig({ name: 'a', impostor: { tile: 128 } }, 'test.json')).toThrow(/unknown key 'tile'/);
    expect(() => parseConfig({ name: 'a', impostor: 128 }, 'test.json')).toThrow(/must be an object/);
    expect(() => parseConfig({ name: 'a', impostorFrom: 192 }, 'test.json')).toThrow(/now 'impostor.fromDistance'/);
    expect(() => parseConfig({ name: 'a', impostorTile: 128 }, 'test.json')).toThrow(/now 'impostor.tileSize'/);
  });

  it('carries the tuned handover into the emitted layer', () => {
    const params = paramsFor({ cullDistance: '800', impostor: { fromDistance: 192, views: 12, tileSize: 256 } });
    const layer = scatterLayer(params, buildSkeleton(params));

    expect(layer.impostor).toEqual({ fromDistance: 192, views: 12, tileSize: 256 });
  });

  // The same bounds validateImpostor holds a layer to, so a printed row is one
  // the engine will accept rather than one it refuses on paste.
  it('refuses an impostor the engine would reject', () => {
    expect(() => paramsFor({ cullDistance: '160', impostor: { fromDistance: 160 } })).toThrow(/never draw/);
    expect(() => paramsFor({ cullDistance: '160', impostor: { fromDistance: 200 } })).toThrow(/never draw/);
    expect(() => paramsFor({ impostor: { views: 1 } })).toThrow(/at least 2/);
    expect(() => paramsFor({ impostor: { tileSize: 0 } })).toThrow(/positive number of pixels/);
    expect(() => paramsFor({ impostor: { fromDistance: -5 } })).toThrow(/not be negative/);
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
      expect(scatterLayerEntry(layer).includes('"authoredNormals": true')).toBe(expected);
    }
  });

  it('shades as foliage in every leaf normal mode', () => {
    // A card is a cluster of leaves whichever way its normal was authored, and
    // none of those ways wants a metallic-roughness specular lobe over it.
    for (const mode of ['canopy', 'up', 'card']) {
      const { params, skeleton } = buildAll({ leafNormalMode: mode });
      const layer = scatterLayer(params, skeleton);
      const entry = scatterLayerEntry(layer);

      expect(layer.foliage).toBe(true);
      expect(entry).toContain('"foliage": true');
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

  it('prints the entry as scatter-layers.json holds it', () => {
    const { params, skeleton } = buildAll();
    const layer = scatterLayer(params, skeleton);

    expect(JSON.parse(`{${scatterLayerEntry(layer)}}`)).toEqual({ test_tree: layer });
  });

  it('finds an entry by its key or by the name it carries', () => {
    const { params, skeleton } = buildAll();
    const layer = scatterLayer(params, skeleton);

    expect(scatterLayerKey({ test_tree: layer }, 'test_tree')).toBe('test_tree');
    expect(scatterLayerKey({ old_key: layer }, 'test_tree')).toBe('old_key');
    expect(scatterLayerKey({ other: { ...layer, name: 'other' } }, 'test_tree')).toBeUndefined();
  });

  describe('writing scatter-layers.json', () => {
    let root: string;
    let path: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'scatter-forge-layers-'));
      path = join(root, 'scatter-layers.json');
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    const contentsOf = async (): Promise<Record<string, unknown>> =>
      JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;

    it('replaces the entry that carries its name and keeps its slot', async () => {
      const { params, skeleton } = buildAll();
      const layer = scatterLayer(params, skeleton);
      const stale = { ...layer, footprint: 99, materialId: 'gone' };
      const other = { ...layer, name: 'other' };
      await writeFile(path, JSON.stringify({ first: other, test_tree: stale, last: other }, null, 2));

      await writeScatterLayer(path, layer);

      const contents = await contentsOf();
      expect(Object.keys(contents)).toEqual(['first', 'test_tree', 'last']);
      expect(contents.test_tree).toEqual(layer);
      expect(contents.first).toEqual(other);
    });

    it('appends an entry the file does not have', async () => {
      const { params, skeleton } = buildAll();
      const layer = scatterLayer(params, skeleton);
      const other = { ...layer, name: 'other' };
      await writeFile(path, JSON.stringify({ other }, null, 2));

      await writeScatterLayer(path, layer);

      const contents = await contentsOf();
      expect(Object.keys(contents)).toEqual(['other', 'test_tree']);
      expect(contents.test_tree).toEqual(layer);
    });

    it('rewrites the same file on a second run', async () => {
      const { params, skeleton } = buildAll();
      const layer = scatterLayer(params, skeleton);
      await writeFile(path, '{}');

      await writeScatterLayer(path, layer);
      const once = await readFile(path, 'utf8');
      await writeScatterLayer(path, layer);

      expect(await readFile(path, 'utf8')).toBe(once);
    });
  });
});

describe('preview', () => {
  /** A flat two-texel canvas. The comparison sheet is about geometry, and a
   *  generated atlas would make this the slowest test in the file. */
  function stubCanvas(): Canvas {
    const texels = 4;
    return {
      width: 2,
      height: 2,
      bumpStrength: 1,
      albedo: new Float32Array(texels * 3).fill(0.5),
      alpha: new Float32Array(texels).fill(1),
      relief: new Float32Array(texels),
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
    const tier = buildMesh(tierParams(params, params.lods[0]), skeleton, TREE_ATLAS);

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
    const tier = buildMesh(tierParams(params, params.lods[0]), skeleton, TREE_ATLAS);

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

  // An override a type never reads is the same silent no-op a stray key is.
  it('rejects a tier override that belongs to another type', () => {
    expect(() => parseConfig({ name: 't', lods: [{ distance: 40, cardSegments: 2 }] }, 'test.json')).toThrow(
      /'cardSegments' applies to clump, crown, not to a tree's tier/
    );
    expect(() =>
      parseConfig({ type: 'crown', name: 'c', lods: [{ distance: 40, leavesPerBranch: 2 }] }, 'test.json')
    ).toThrow(/'leavesPerBranch' applies to tree, not to a crown's tier/);
    expect(() => parseConfig({ type: 'clump', name: 'c', lods: [{ distance: 40 }] }, 'test.json')).toThrow(
      /'lods' applies to tree, crown/
    );
  });

  it('coarsens a crown on the same stem and refuses a chain without one', () => {
    const params = resolveParams({
      type: 'crown',
      name: 'palm',
      stemHeight: 6,
      frondCount: 12,
      cardSegments: 6,
      radialSegments: 12,
      cullDistance: 300,
      lods: [{ distance: 60, radialSegments: 6, cardSegments: 2 }],
    });
    const base = buildCrown(params, CROWN_ATLAS);
    const tier = buildCrown(tierParams(params, params.lods[0]), CROWN_ATLAS);

    expect(pieceOf(tier.mesh, 'frond').triangleCount).toBe(12 * 2 * 2);
    expect(pieceOf(base.mesh, 'frond').triangleCount).toBe(12 * 6 * 2);
    expect(totalTriangles(tier.mesh)).toBeLessThan(totalTriangles(base.mesh) / 2);

    // The stem is seeded, so the tier stands on the same centre line.
    const stem = (crown: ReturnType<typeof buildCrown>) => crown.skeleton!.branches[0].points.map((p) => p.p);
    expect(stem(tier)).toEqual(stem(base));

    expect(crownLayer(params, base).lodDistances).toEqual([60]);

    expect(() => resolveParams({ type: 'crown', name: 'f', stemHeight: 0, lods: [{ distance: 20 }] })).toThrow(
      /lods need a stem/
    );
  });

  it('holds tiers to ascending distances short of the impostor', () => {
    expect(() => paramsFor({ lods: [{ distance: 80 }, { distance: 40 }] })).toThrow(/must ascend/);
    expect(() => paramsFor({ cullDistance: '100', lods: [{ distance: 60 }] })).toThrow(/beyond the impostor at 60m/);

    // The tier ceiling has to follow impostor.fromDistance, or a chain validated
    // against one distance would ship against another.
    expect(() => paramsFor({ impostor: { fromDistance: 50 }, lods: [{ distance: 60 }] })).toThrow(
      /beyond the impostor at 50m/
    );
    expect(() => paramsFor({ impostor: { fromDistance: 90 }, lods: [{ distance: 60 }] })).not.toThrow();
  });

  it('holds a tier to the same bounds as the model', () => {
    expect(() => paramsFor({ lods: [{ distance: 40, radialSegments: 1 }] })).toThrow(/radialSegments/);
  });

  // The chain is what makes a forest affordable, so a tier that is not
  // cheaper than the one before it is a mistake worth catching here.
  it('builds each tier cheaper than the last on the same skeleton', () => {
    const { params, skeleton, mesh } = buildAll(chain);
    const tiers = params.lods.map((tier) => buildMesh(tierParams(params, tier), skeleton, TREE_ATLAS));

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
      const leaves = pieceOf(buildMesh(params, skeleton, TREE_ATLAS), 'leaf');
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
    expect(JSON.parse(`{${scatterLayerEntry(layer)}}`).test_tree.lodDistances).toEqual([40, 80]);
    expect(scatterLayer(paramsFor(), skeleton).lodDistances).toBeUndefined();
  });
});

describe('clump', () => {
  const clumpParams = (extra: RawConfig = {}): Params =>
    resolveParams({ type: 'clump', name: 'test-clump', ...extra });

  const build = (extra: RawConfig = {}, cells = CLUMP_CELLS_GENERATED) =>
    buildClump(clumpParams(extra), layoutAtlas(cells, []));

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
    for (const type of ['tree', 'clump', 'crown', 'rock'] as const) {
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

  it('faces every normal straight at the sky at normalLean 0', () => {
    const { normals, vertexCount } = build({ normalLean: 0 }).mesh.pieces[0].attributes;
    for (let i = 0; i < vertexCount; i++) expect(normals[i * 3 + 1]).toBeCloseTo(1, 6);
  });

  it('rejects a negative normalLean', () => {
    expect(() => build({ normalLean: -0.1 })).toThrow(/normalLean/);
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

    const entry = scatterLayerEntry(layer);
    expect(entry).not.toContain('impostor');
    expect(entry).not.toContain('collider');
    expect(entry).toContain('"authoredNormals": true');
    expect(entry).toContain('"yOffset":');

    // A patch metres wide is worth a billboard, and gets one only by asking.
    const patch = clumpParams({ cullDistance: 420, impostor: { fromDistance: 160, views: 2, tileSize: 64 } });
    expect(hasImpostor(patch)).toBe(true);
    expect(clumpLayer(patch, metrics).impostor).toEqual({ fromDistance: 160, views: 2, tileSize: 64 });
    expect(clumpLayer(clumpParams({ impostor: { views: 2 } }), metrics).impostor).toEqual({
      fromDistance: 30,
      views: 2,
      tileSize: 128,
    });
    expect(() => clumpParams({ impostor: { fromDistance: 60 } })).toThrow(/never draw/);
    expect(hasImpostor(clumpParams())).toBe(false);
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

describe('crown', () => {
  const crownParams = (extra: RawConfig = {}): Params =>
    resolveParams({ type: 'crown', name: 'test-crown', ...extra });

  const build = (extra: RawConfig = {}, cells = CROWN_CELLS_GENERATED) => buildCrown(crownParams(extra), layoutAtlas(cells, []));

  it('takes the tube keys from the tree and the card keys from the clump', () => {
    const crown = crownParams();
    expect(crown.out).toBe('assets/shared/nature/crowns');
    expect(crown.trunkFlare).toBe(0.25);
    expect(crown.cardCurve).toBe(80);
    expect(crown.textureSize).toBe(2048);

    // A crown is two lengths, not one height, so `height` is not its key.
    expect(() => parseConfig({ type: 'crown', name: 'a', height: 8 }, 'test.json')).toThrow(
      /'height' applies to tree, clump, rock, pebble, not to type 'crown'/
    );
    expect(() => parseConfig({ type: 'crown', name: 'a', splits: 4 }, 'test.json')).toThrow(/applies to tree/);
    expect(() => parseConfig({ name: 'a', stemHeight: 4 }, 'test.json')).toThrow(
      /'stemHeight' applies to crown, not to type 'tree'/
    );
  });

  it('grows a bark stem and a frond rosette, and drops the stem at 0', () => {
    const palm = build({ stemHeight: 6, frondCount: 10, cardSegments: 4 });
    expect(palm.mesh.pieces.map((piece) => piece.key)).toEqual(['bark', 'frond']);
    expect(palm.skeleton).not.toBeNull();
    expect(pieceOf(palm.mesh, 'frond').triangleCount).toBe(10 * 4 * 2);
    expect(hasStem(crownParams({ stemHeight: 6 }))).toBe(true);

    const fern = build({ stemHeight: 0 });
    expect(fern.mesh.pieces.map((piece) => piece.key)).toEqual(['frond']);
    expect(fern.skeleton).toBeNull();
    expect(hasStem(crownParams({ stemHeight: 0 }))).toBe(false);
  });

  // The bark material would still load its four images for a piece nothing
  // draws, so a stemless crown ships neither the piece nor its files.
  it('ships bark files and a material only while it has a stem', () => {
    expect(heightPieces('crown', true)).toEqual(['bark']);
    expect(materialPieces('crown', true)).toEqual(['bark']);
    expect(heightPieces('crown', false)).toEqual([]);
    expect(materialPieces('crown', false)).toEqual([]);
  });

  it('puts the rosette on top of the stem and reports the frond length it was asked for', () => {
    const { metrics, mesh } = build({ stemHeight: 5, frondLength: 2, frondAngle: 45, cardCurve: 0 });
    expect(metrics.stemHeight).toBe(5);
    expect(metrics.frondLength).toBe(2);

    // Straight fronds at 45 degrees rise by a known amount above the stem top.
    const { positions, vertexCount } = pieceOf(mesh, 'frond');
    let lowest = Infinity;
    for (let i = 0; i < vertexCount; i++) lowest = Math.min(lowest, positions[i * 3 + 1]);
    expect(lowest).toBeGreaterThan(4.5);
    expect(metrics.height).toBeGreaterThan(5 + 2 * Math.SQRT1_2 * 0.9);
    expect(metrics.height).toBeLessThan(5 + 2 * Math.SQRT1_2 * 1.1 + 0.3);
  });

  it('flares the stem at the foot and swells it under the crown', () => {
    const rings = build({ stemHeight: 10, segments: 18, trunkRadius: 1, trunkTaper: 0.8, trunkFlare: 0.3, crownBulge: 0.2 })
      .skeleton!.branches[0].points;
    const radius = (t: number): number => rings[Math.round(t * (rings.length - 1))].radius;

    // The foot is trunkRadius plus the flare, and the flare is gone by a quarter of the way up.
    expect(radius(0)).toBeCloseTo(1.3, 5);
    expect(radius(0.3)).toBeLessThan(1.02);
    // The waist is the plain taper, and the crownshaft rises above it.
    expect(radius(0.55)).toBeLessThan(radius(0.3));
    expect(radius(0.9)).toBeGreaterThan(radius(0.55) + 0.1);
    // And comes back in at the very top, so it reads as a bulge and not a wider tube.
    expect(radius(1)).toBeLessThan(radius(0.9));
    expect(radius(1)).toBeGreaterThan(0.8);

    // Both off, the stem is the trunk's own taper.
    const plain = build({ stemHeight: 10, segments: 18, trunkRadius: 1, trunkTaper: 0.8, trunkFlare: 0, crownBulge: 0 })
      .skeleton!.branches[0].points;
    expect(plain[0].radius).toBeCloseTo(1, 5);
    expect(plain[plain.length - 1].radius).toBeCloseTo(0.8, 5);
    for (let i = 1; i < plain.length; i++) expect(plain[i].radius).toBeLessThanOrEqual(plain[i - 1].radius);

    expect(() => crownParams({ trunkFlare: -0.1 })).toThrow(/trunkFlare/);
    expect(() => crownParams({ crownBulge: -0.1 })).toThrow(/crownBulge/);
  });

  it('leans the stem from its upper half rather than evenly', () => {
    const { skeleton } = build({ stemHeight: 10, stemLean: 30, segments: 10 });
    const points = skeleton!.branches[0].points;
    const lean = (index: number): number => Math.hypot(points[index].p[0], points[index].p[2]);
    const half = Math.floor(points.length / 2);
    // An even lean would put half the offset at the halfway ring. Eased in, far less lands there.
    expect(lean(half)).toBeLessThan(lean(points.length - 1) * 0.35);
    expect(lean(points.length - 1)).toBeGreaterThan(1);
  });

  it('phases every frond with the stem so the rosette rides its sway', () => {
    const { mesh } = build({ stemHeight: 6 });
    const bark = pieceOf(mesh, 'bark');
    const frond = pieceOf(mesh, 'frond');
    const stemPhase = bark.colors[1];

    for (let i = 0; i < bark.vertexCount; i++) expect(bark.colors[i * 4 + 1]).toBe(stemPhase);
    for (let i = 0; i < frond.vertexCount; i++) expect(frond.colors[i * 4 + 1]).toBe(stemPhase);

    // The frond's own motion is flutter, phased per frond in A.
    const frondPhases = new Set([...frond.colors].filter((_, i) => i % 4 === 3));
    expect(frondPhases.size).toBe(crownParams().frondCount);
  });

  it('carries the bend on from the stem top to the frond tips', () => {
    const { mesh } = build({ stemHeight: 6, frondLength: 3, bendCurve: 1 });
    const bark = pieceOf(mesh, 'bark');
    const frond = pieceOf(mesh, 'frond');

    const bends = (piece: MeshAttributes) => [...piece.colors].filter((_, i) => i % 4 === 0);
    expect(Math.min(...bends(bark))).toBe(0);
    // The stem top is six ninths of the path, and the tube's cap ring sits just past it.
    expect(Math.max(...bends(bark))).toBeCloseTo(6 / 9, 1);
    expect(Math.max(...bends(frond))).toBe(1);
    expect(Math.min(...bends(frond))).toBeCloseTo(6 / 9, 5);
  });

  it('samples only the column of its cell that the card is wide', () => {
    const params = crownParams({ cardAspect: 0.25 });
    const { uvs, vertexCount } = pieceOf(build({ cardAspect: 0.25 }).mesh, 'frond');
    const cells = leafCells(params.textureSize, 2);

    for (let i = 0; i < vertexCount; i++) {
      const u = uvs[i * 2];
      const v = uvs[i * 2 + 1];
      const cell = cells.find((c) => v >= c.v0 - 1e-6 && v <= c.v1 + 1e-6 && u >= c.u0 && u <= c.u1);
      expect(cell).toBeDefined();
      const column = columnOf(cell!, 0.25);
      expect(u).toBeGreaterThanOrEqual(column.u0 - 1e-6);
      expect(u).toBeLessThanOrEqual(column.u1 + 1e-6);
      expect(column.u1 - column.u0).toBeCloseTo((cell!.v1 - cell!.v0) * 0.25, 6);
    }
  });

  it('never addresses a cell nothing painted', () => {
    const cells = 3;
    expect(crownAtlas({ stamps: new Array(cells) } as never)).toEqual({ grid: 2, cells });
    expect(crownAtlas(null)).toEqual({ grid: 2, cells: CROWN_CELLS_GENERATED });

    const { uvs, vertexCount } = pieceOf(build({ frondCount: 20 }, cells).mesh, 'frond');
    const painted = leafCells(crownParams().textureSize, 2).slice(0, cells);

    for (let i = 0; i < vertexCount; i++) {
      const u = uvs[i * 2];
      const v = uvs[i * 2 + 1];
      expect(
        painted.some((cell) => u >= cell.u0 - 1e-6 && u <= cell.u1 + 1e-6 && v >= cell.v0 - 1e-6 && v <= cell.v1 + 1e-6)
      ).toBe(true);
    }
  });

  it('emits a tree layer with a stem and a clump layer without one', () => {
    const palmParams = crownParams({ stemHeight: 6, cullDistance: 300 });
    const palm = crownLayer(palmParams, buildCrown(palmParams, CROWN_ATLAS));
    expect(palm.impostor).toEqual({ fromDistance: 180, views: 8, tileSize: 128 });
    expect(palm.collider).toMatchObject({ type: 'capsule', radius: 0.23 });
    expect(palm.alignToNormal).toBe(0);
    expect(palm.authoredNormals).toBe(true);
    expect(palm.castShadow).toBe(true);
    expect(hasImpostor(palmParams)).toBe(true);

    const fernParams = crownParams({ stemHeight: 0 });
    const fern = crownLayer(fernParams, buildCrown(fernParams, CROWN_ATLAS));
    expect(fern.impostor).toBeUndefined();
    expect(fern.collider).toBeUndefined();
    expect(fern.alignToNormal).toBeGreaterThan(0);
    expect(fern.castShadow).toBe(false);
    expect(hasImpostor(fernParams)).toBe(false);

    expect(() => scatterLayerEntry(palm)).not.toThrow();
    expect(() => scatterLayerEntry(fern)).not.toThrow();

    // The key overrides the stem's decision either way.
    const shadyFern = crownParams({ stemHeight: 0, castShadow: true });
    expect(crownLayer(shadyFern, buildCrown(shadyFern, CROWN_ATLAS)).castShadow).toBe(true);
    const dimPalm = crownParams({ stemHeight: 6, castShadow: false });
    expect(crownLayer(dimPalm, buildCrown(dimPalm, CROWN_ATLAS)).castShadow).toBe(false);
    expect(resolveParams({ name: 'a' }).castShadow).toBe(true);
    expect(resolveParams({ name: 'a', type: 'clump' }).castShadow).toBe(false);
  });

  it('shades the cutout as foliage unless the key turns it off', () => {
    expect(resolveParams({ name: 'a' }).foliage).toBe(true);
    const fern = crownParams({ stemHeight: 0 });
    expect(crownLayer(fern, buildCrown(fern, CROWN_ATLAS)).foliage).toBe(true);
    const flower = crownParams({ stemHeight: 0, foliage: false });
    expect(crownLayer(flower, buildCrown(flower, CROWN_ATLAS)).foliage).toBe(false);
  });

  it('holds a stem to the trunk bounds and skips them without one', () => {
    expect(() => crownParams({ stemHeight: 6, trunkTaper: 1.5 })).toThrow(/trunkTaper/);
    expect(() => crownParams({ stemHeight: 6, impostor: { fromDistance: 500 } })).toThrow(/impostor/);
    expect(() => crownParams({ stemHeight: 0, trunkTaper: 1.5 })).not.toThrow();
    expect(() => crownParams({ stemHeight: -1 })).toThrow(/stemHeight/);
    expect(() => crownParams({ frondCount: 0 })).toThrow(/frondCount/);
    expect(() => crownParams({ frondAngle: 100 })).toThrow(/frondAngle/);
  });

  it('attaches fronds down the stem by frondSpan, with the lowest hanging most', () => {
    const top = build({ stemHeight: 10, frondCount: 20, frondSpan: 0, stemLean: 0 });
    const deep = build({ stemHeight: 10, frondCount: 20, frondSpan: 0.6, frondVariance: 40, stemLean: 0 });

    // Row 0 of each frond is its base; a frond has (cardSegments + 1) rows of two vertices.
    const baseHeights = (crown: ReturnType<typeof build>, segments: number): number[] => {
      const { positions } = pieceOf(crown.mesh, 'frond');
      const perFrond = (segments + 1) * 2;
      return Array.from({ length: 20 }, (_, i) => positions[i * perFrond * 3 + 1]);
    };
    const tipHeights = (crown: ReturnType<typeof build>, segments: number): number[] => {
      const { positions } = pieceOf(crown.mesh, 'frond');
      const perFrond = (segments + 1) * 2;
      return Array.from({ length: 20 }, (_, i) => positions[(i * perFrond + segments * 2) * 3 + 1]);
    };

    for (const y of baseHeights(top, 5)) expect(y).toBeCloseTo(10, 0);

    const bases = baseHeights(deep, 5);
    expect(Math.max(...bases)).toBeCloseTo(10, 0);
    expect(Math.min(...bases)).toBeCloseTo(4, 0);
    // Ordered by index: the first frond is at the top, the last at the bottom.
    expect(bases[0]).toBeGreaterThan(bases[19]);

    // The lowest frond leaves nearer horizontal than the highest, so its tip
    // drops further below its own base.
    const tips = tipHeights(deep, 5);
    expect(tips[19] - bases[19]).toBeLessThan(tips[0] - bases[0]);
  });

  it('reproduces a crown byte for byte from the same seed', () => {
    const a = writeGlb({ name: 'p', mesh: build({ seed: 5 }).mesh, textures: CROWN_TEXTURES, alphaCutoff: 0.45 });
    const b = writeGlb({ name: 'p', mesh: build({ seed: 5 }).mesh, textures: CROWN_TEXTURES, alphaCutoff: 0.45 });
    expect(a.equals(b)).toBe(true);

    const gltf = readGltf(a);
    expect(gltf.materials.map((material: { alphaMode: string }) => material.alphaMode)).toEqual(['OPAQUE', 'MASK']);
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

  const build = (extra: RawConfig = {}) => buildClump(patchParams(extra), CLUMP_ATLAS);

  it('grows one tuft per model by default, so an existing clump is unchanged', () => {
    const single = resolveParams({ type: 'clump', name: 'a' });
    expect(single.tuftsPerModel).toBe(1);
    expect(patchRadiusOf(single)).toBe(0);
    expect(buildClump(single, CLUMP_ATLAS).metrics.patchRadius).toBe(0);
  });

  it('multiplies the tufts without multiplying the instances', () => {
    const one = buildClump(patchParams({ tuftsPerModel: 1 }), CLUMP_ATLAS);
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
    const single = buildClump(resolveParams({ type: 'clump', name: 'a', footprint: 0 }), CLUMP_ATLAS);
    const patch = buildClump(patchParams({ footprint: 0 }), CLUMP_ATLAS);

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

describe('accents', () => {
  const spire = { stamps: ['fern-spire'], count: 1, pitch: 0, length: 0.5 };
  const fruit = { stamps: ['acorn'], count: 1, pitch: 180, length: 0.2 };

  /** The cards past the host's own, as rows of [x, y, z] per vertex. */
  const cardsAfter = (attributes: MeshAttributes, hostVertices: number, segments = 1) => {
    const perCard = (segments + 1) * 2;
    const cards: number[][][] = [];
    for (let v = hostVertices; v < attributes.vertexCount; v += perCard)
      cards.push(
        Array.from({ length: perCard }, (_, k) => Array.from(attributes.positions.subarray((v + k) * 3, (v + k) * 3 + 3)))
      );
    return cards;
  };

  it('parses an accent with its defaults, and refuses what it cannot use', () => {
    const [accent] = resolveParams({ name: 'a', accents: [fruit] }).accents;
    expect(accent).toEqual({ ...fruit, variance: 10, aspect: 0.5, segments: 1, curve: 0, flutter: 0.25, attach: 'twigs', depth: null });

    expect(() => parseConfig({ name: 'a', accents: [{ ...fruit, size: 2 }] }, 't.json')).toThrow(/unknown key 'size'/);
    expect(() => parseConfig({ name: 'a', accents: [{ count: 1, pitch: 0, length: 1 }] }, 't.json')).toThrow(/needs 'stamps'/);
    expect(() => parseConfig({ name: 'a', accents: [{ ...fruit, stamps: [] }] }, 't.json')).toThrow(/non-empty list/);
    expect(() => parseConfig({ name: 'a', accents: [{ ...fruit, pitch: 200 }] }, 't.json')).toThrow(/'pitch' must be within 0..180/);
    expect(() => parseConfig({ name: 'a', accents: [{ ...fruit, segments: 0 }] }, 't.json')).toThrow(/'segments' must be within 1..12/);
    expect(() => parseConfig({ name: 'a', accents: fruit }, 't.json')).toThrow(/must be a list of accents/);
  });

  it('holds the per-type keys to their type, on the way in and on the way out', () => {
    expect(() => parseConfig({ type: 'crown', name: 'a', accents: [{ ...spire, attach: 'forks' }] }, 't.json')).toThrow(
      /'attach' applies to tree, not to a crown/
    );
    expect(() => parseConfig({ name: 'a', accents: [{ ...fruit, depth: [0, 0.5] }] }, 't.json')).toThrow(
      /'depth' applies to crown, not to a tree/
    );
    expect(() => parseConfig({ type: 'crown', name: 'a', accents: [{ ...spire, depth: [0.5, 0.2] }] }, 't.json')).toThrow(
      /0 <= from <= to <= 1/
    );

    // A crown's sidecar must not carry the tree's default `attach`, or it is
    // rejected by the check above when it is opened again.
    for (const raw of [
      { type: 'crown', name: 'a', accents: [{ ...spire, depth: [0.2, 0.4] }] },
      { name: 'a', accents: [{ ...fruit, attach: 'forks' }] },
      { type: 'clump', name: 'a', accents: [spire] },
    ] as RawConfig[]) {
      const params = resolveParams(raw);
      const saved = toConfig(params);
      expect(resolveParams(parseConfig(JSON.parse(JSON.stringify(saved)), 't.json'))).toEqual(params);
    }
    const crownSaved = (toConfig(resolveParams({ type: 'crown', name: 'a', accents: [spire] })).accents as object[])[0];
    expect(crownSaved).not.toHaveProperty('attach');
    expect(crownSaved).not.toHaveProperty('depth');
  });

  it('rebuilds the texture for new stamps and not for a moved card', () => {
    const base = resolveParams({ name: 'a', accents: [fruit] });
    expect(sameTexture(base, resolveParams({ name: 'a', accents: [{ ...fruit, count: 3, pitch: 90 }] }))).toBe(true);
    expect(sameTexture(base, resolveParams({ name: 'a', accents: [{ ...fruit, stamps: ['berry'] }] }))).toBe(false);
    expect(sameTexture(base, resolveParams({ name: 'a' }))).toBe(false);
  });

  it('appends accent cells after the host on the smallest square that holds them', () => {
    expect(layoutAtlas(4, [])).toEqual({ grid: 2, cells: 4, accents: [] });
    expect(layoutAtlas(4, [1, 2])).toEqual({
      grid: 3,
      cells: 4,
      accents: [
        { offset: 4, count: 1 },
        { offset: 5, count: 2 },
      ],
    });
    expect(layoutAtlas(3, [1]).grid).toBe(2);
  });

  it('hangs one card per leaf twig, or per fork, and none where the count says none', () => {
    const shape: RawConfig = { splits: 3, branchLevels: 3, leafLevels: 1, leavesPerBranch: 2 };
    const skeleton = buildSkeleton(paramsFor(shape));
    const twigs = skeleton.branches.filter((branch) => branch.bearsLeaves).length;
    const forks = skeleton.branches.reduce((sum, branch) => sum + branch.children.length, 0);
    const leafVertices = twigs * 2 * 4;
    const atlas = layoutAtlas(LEAF_GRID_GENERATED ** 2, [1]);

    const build = (accents: object[]) => pieceOf(buildMesh(paramsFor({ ...shape, accents: accents as never }), skeleton, atlas), 'leaf');

    expect(build([]).vertexCount).toBe(leafVertices);
    expect(cardsAfter(build([fruit]), leafVertices)).toHaveLength(twigs);
    expect(cardsAfter(build([{ ...fruit, attach: 'forks' }]), leafVertices)).toHaveLength(forks);
    expect(cardsAfter(build([{ ...fruit, count: 0 }]), leafVertices)).toHaveLength(0);

    const some = cardsAfter(build([{ ...fruit, count: 0.5 }]), leafVertices).length;
    expect(some).toBeGreaterThan(0);
    expect(some).toBeLessThan(twigs);
  });

  it('pitches a card from the sky, not from its branch: 180 hangs, 0 stands', () => {
    const shape: RawConfig = { leafLevels: 1, leavesPerBranch: 1, leafDroop: 0 };
    const skeleton = buildSkeleton(paramsFor(shape));
    const leafVertices = skeleton.branches.filter((branch) => branch.bearsLeaves).length * 4;
    const atlas = layoutAtlas(LEAF_GRID_GENERATED ** 2, [1]);
    const build = (pitch: number) =>
      cardsAfter(pieceOf(buildMesh(paramsFor({ ...shape, accents: [{ ...fruit, pitch, variance: 0 }] as never }), skeleton, atlas), 'leaf'), leafVertices);

    const hanging = build(180);
    expect(hanging.length).toBeGreaterThan(0);
    for (const [a, b, c, d] of hanging) {
      // The base row is at the twig and the tip row a card length straight
      // below it, whichever way the twig points.
      expect(a[1] - c[1]).toBeGreaterThan(0.2 * 0.8 - 1e-6);
      expect(a[1] - c[1]).toBeLessThanOrEqual(0.2 + 1e-6);
      expect(Math.hypot(c[0] - a[0], c[2] - a[2])).toBeLessThan(1e-6);
      expect(Math.hypot(d[0] - b[0], d[2] - b[2])).toBeLessThan(1e-6);
    }

    for (const [a, , c] of build(0)) expect(c[1] - a[1]).toBeGreaterThan(0.2 * 0.8 - 1e-6);
  });

  it('raises a spire from a stemless crown and hangs a skirt down a stemmed one', () => {
    const fern = resolveParams({
      type: 'crown',
      name: 'fern',
      stemHeight: 0,
      frondCount: 4,
      cardSegments: 2,
      accents: [{ ...spire, count: 3, segments: 3, variance: 0 }],
    });
    const frondVertices = 4 * 3 * 2;
    const spires = cardsAfter(pieceOf(buildCrown(fern, layoutAtlas(CROWN_CELLS_GENERATED, [1])).mesh, 'frond'), frondVertices, 3);
    expect(spires).toHaveLength(3);
    for (const rows of spires) {
      // Its base a couple of centimetres off the centre, its tip well up.
      const base = [(rows[0][0] + rows[1][0]) / 2, (rows[0][2] + rows[1][2]) / 2];
      expect(Math.hypot(base[0], base[1])).toBeLessThan(0.05);
      expect(rows[0][1]).toBeCloseTo(0, 5);
      expect(rows[6][1]).toBeGreaterThan(0.35);
    }

    const palm = resolveParams({
      type: 'crown',
      name: 'palm',
      stemHeight: 10,
      stemLean: 0,
      trunkWander: 0,
      frondCount: 4,
      cardSegments: 2,
      accents: [{ ...fruit, count: 4, length: 2, depth: [0.2, 0.4] }],
    });
    const skirt = cardsAfter(pieceOf(buildCrown(palm, layoutAtlas(CROWN_CELLS_GENERATED, [1])).mesh, 'frond'), frondVertices);
    expect(skirt).toHaveLength(4);
    for (const [base, , tip] of skirt) expect(tip[1]).toBeLessThan(base[1] - 1);
    // Dealt down the band the config named, top first.
    expect(skirt[0][0][1]).toBeCloseTo(8, 5);
    expect(skirt[3][0][1]).toBeCloseTo(6, 5);
  });

  it('stands a spire in every tuft of a patch, or in the share of them the count names', () => {
    const shape: RawConfig = { type: 'clump', name: 'grass', tuftsPerModel: 9, cardsPerTuft: 3, cardSegments: 1 };
    const patch = (count: number) => resolveParams({ ...shape, accents: [{ ...spire, count }] });
    const tuftVertices = 9 * 3 * 4;
    const atlas = layoutAtlas(CLUMP_CELLS_GENERATED, [1]);

    const every = cardsAfter(buildClump(patch(1), atlas).mesh.pieces[0].attributes, tuftVertices);
    expect(every).toHaveLength(9);
    for (const [base] of every) expect(base[1]).toBeCloseTo(0, 5);

    const some = cardsAfter(buildClump(patch(0.4), atlas).mesh.pieces[0].attributes, tuftVertices).length;
    expect(some).toBeGreaterThan(0);
    expect(some).toBeLessThan(9);

    // A patch with no accents is the patch it always was.
    expect(buildClump(patch(0), atlas).mesh.pieces[0].attributes.positions).toEqual(
      buildClump(resolveParams(shape), CLUMP_ATLAS).mesh.pieces[0].attributes.positions
    );
  });

  it('addresses only the cells set aside for it, and flutters no more than it is told', () => {
    const params = paramsFor({ leafLevels: 1, leavesPerBranch: 1, accents: [{ ...fruit, flutter: 0.1, count: 2 }] as never });
    const skeleton = buildSkeleton(params);
    const leafVertices = skeleton.branches.filter((branch) => branch.bearsLeaves).length * 4;
    const atlas = layoutAtlas(LEAF_GRID_GENERATED ** 2, [2]);
    const { uvs, colors, vertexCount } = pieceOf(buildMesh(params, skeleton, atlas), 'leaf');
    const own = leafCells(params.textureSize, atlas.grid).slice(16, 18);

    expect(vertexCount).toBeGreaterThan(leafVertices);
    for (let v = leafVertices; v < vertexCount; v++) {
      const u = uvs[v * 2];
      const t = uvs[v * 2 + 1];
      expect(own.some((cell) => u >= cell.u0 - 1e-6 && u <= cell.u1 + 1e-6 && t >= cell.v0 - 1e-6 && t <= cell.v1 + 1e-6)).toBe(true);
      expect(colors[v * 4 + 2]).toBeLessThanOrEqual(0.1 + 1e-6);
    }
  });
});

describe('rock', () => {
  const rockParams = (extra: RawConfig = {}): Params =>
    resolveParams({ type: 'rock', name: 'test-rock', seed: 7, ...extra });

  const build = (extra: RawConfig = {}) => buildRock(rockParams(extra));

  const STONE_TEXTURES: GlbTextureSet = {
    stone: { baseColor: 'a_stone_diff.webp', normal: 'a_stone_nor.webp', arm: 'a_stone_arm.webp' },
  };

  it("rejects another type's keys, and its own on another type", () => {
    expect(() => parseConfig({ type: 'rock', name: 'a', splits: 4 }, 'test.json')).toThrow(
      /'splits' applies to tree, not to type 'rock'/
    );
    expect(() => parseConfig({ type: 'rock', name: 'a', windAmplitude: 1 }, 'test.json')).toThrow(
      /'windAmplitude' applies to tree, clump, crown, not to type 'rock'/
    );
    expect(() => parseConfig({ name: 'a', scoops: 1 }, 'test.json')).toThrow(
      /'scoops' applies to rock, pebble, not to type 'tree'/
    );
  });

  it('takes its defaults from the type', () => {
    const rock = rockParams();
    expect(rock.out).toBe('assets/shared/nature/rocks');
    expect(rock.cullDistance).toBe(800);
    expect(impostorDistance(rock)).toBe(120);
    expect(rock.height).toBe(1.2);
  });

  it('holds its keys to their ranges', () => {
    expect(() => rockParams({ scoopDepth: 1.5 })).toThrow(/scoopDepth must be within 0..0.6/);
    expect(() => rockParams({ relief: 0.6 })).toThrow(/relief must be within 0..0.5/);
    expect(() => rockParams({ scoops: 25 })).toThrow(/scoops must be within 0..24/);
    expect(() => rockParams({ subdivisions: 1 })).toThrow(/subdivisions must be within 2..128/);
    expect(() => rockParams({ weathering: -1 })).toThrow(/weathering must be within 0..1/);
    expect(() => rockParams({ reliefSize: 0 })).toThrow(/reliefSize must be positive/);
    expect(() => rockParams({ grooveDepth: 1 })).toThrow(/grooveDepth must be within 0..0.5/);
  });

  it('cuts a groove under a coarse crack that reaches the silhouette', () => {
    const grooved = build({ relief: 0, scoops: 0, cracks: 2, grooveDepth: 0.1, grooveWidth: 0.2 });
    const plain = build({ relief: 0, scoops: 0, cracks: 0 });
    const a = grooved.mesh.pieces[0].attributes.positions;
    const b = plain.mesh.pieces[0].attributes.positions;
    let deepest = 0;
    for (let i = 0; i < a.length; i += 3) {
      const ra = Math.hypot(a[i], a[i + 1] + grooved.field.base, a[i + 2]);
      const rb = Math.hypot(b[i], b[i + 1] + plain.field.base, b[i + 2]);
      deepest = Math.max(deepest, rb - ra);
    }
    expect(deepest).toBeGreaterThan(grooved.metrics.radius * 0.08);
  });

  it('ships one opaque piece of six faces of quads', () => {
    const { mesh } = build({ subdivisions: 6 });
    expect(mesh.pieces).toHaveLength(1);
    expect(mesh.pieces[0].key).toBe('stone');
    expect(mesh.pieces[0].cutout).toBe(false);
    expect(totalTriangles(mesh)).toBe(6 * 6 * 6 * 2);
  });

  // Every surface point is visible from the centre, so every triangle faces
  // away from it. A face wound the other way would be culled by the engine
  // and show as a hole.
  it('winds every triangle outward from the centre', () => {
    const { mesh, field } = build({ subdivisions: 8, scoops: 12, scoopDepth: 0.6, relief: 0.3 });
    const { positions, indices } = mesh.pieces[0].attributes;
    const centre = [0, -field.base, 0];
    let inward = 0;

    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 3;
      const b = indices[t + 1] * 3;
      const c = indices[t + 2] * 3;
      const abx = positions[b] - positions[a];
      const aby = positions[b + 1] - positions[a + 1];
      const abz = positions[b + 2] - positions[a + 2];
      const acx = positions[c] - positions[a];
      const acy = positions[c + 1] - positions[a + 1];
      const acz = positions[c + 2] - positions[a + 2];
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const ox = (positions[a] + positions[b] + positions[c]) / 3 - centre[0];
      const oy = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3 - centre[1];
      const oz = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3 - centre[2];
      if (nx * ox + ny * oy + nz * oz <= 0) inward++;
    }

    expect(inward).toBe(0);
  });

  it('stands on its lowest point and spans the size it was asked for', () => {
    const { mesh, metrics } = build({ height: 2, width: 3, depth: 1.5, relief: 0, scoops: 0, cracks: 0 });
    const { positions } = mesh.pieces[0].attributes;
    let lowest = Infinity;
    for (let i = 1; i < positions.length; i += 3) lowest = Math.min(lowest, positions[i]);

    expect(lowest).toBeCloseTo(0, 5);
    expect(metrics.height).toBeCloseTo(2, 5);
    expect(metrics.width).toBeCloseTo(3, 5);
    expect(metrics.depth).toBeCloseTo(1.5, 5);
  });

  it('keeps every vertex out of every scoop', () => {
    const { mesh, field } = build({ scoops: 6, scoopDepth: 0.5, relief: 0, cracks: 0, smoothing: 0 });
    const { positions } = mesh.pieces[0].attributes;
    let inside = 0;
    let scooped = 0;

    for (let i = 0; i < positions.length; i += 3) {
      const ux = positions[i] / field.extents[0];
      const uy = (positions[i + 1] + field.base) / field.extents[1];
      const uz = positions[i + 2] / field.extents[2];
      if (Math.hypot(ux, uy, uz) < 1 - 1e-4) scooped++;
      for (const scoop of field.scoops) {
        const dx = ux - scoop.centre[0];
        const dy = uy - scoop.centre[1];
        const dz = uz - scoop.centre[2];
        if (Math.hypot(dx, dy, dz) < scoop.radius - 1e-5) inside++;
      }
    }

    expect(inside).toBe(0);
    expect(scooped).toBeGreaterThan(0);
  });

  it('builds its relief from a slab pile unless plates is 0', () => {
    expect(build({ plates: 0 }).field.plates).toBeNull();
    const { field } = build({ plates: 2 });
    expect(field.plates).not.toBeNull();

    const sample = { height: 0, id: 0 };
    let tops = 0;
    let gaps = 0;
    for (let i = 0; i < 400; i++) {
      const x = ((i * 0.37) % 1.4) - 0.7;
      const y = ((i * 0.71) % 1.4) - 0.7;
      const z = ((i * 0.53) % 1.4) - 0.7;
      platesInto(sample, field.plates!, x, y, z);
      expect(sample.height).toBeGreaterThanOrEqual(0);
      expect(sample.height).toBeLessThanOrEqual(1);
      expect(sample.id).toBeGreaterThanOrEqual(0);
      expect(sample.id).toBeLessThanOrEqual(1);
      if (sample.height > 0.6) tops++;
      if (sample.height < 0.5) gaps++;
    }
    // Slabs overlap, so most of the surface is on a slab and little is gap.
    expect(tops).toBeGreaterThan(250);
    expect(gaps).toBeLessThan(60);

    expect(() => rockParams({ bedding: 2 })).toThrow(/bedding must be within 0..1/);
    expect(() => rockParams({ plateLayers: 5 })).toThrow(/plateLayers must be within 1..4/);
  });

  it('holds a scoop back from overhanging, however deep it is asked to go', () => {
    // A scoop whose silhouette from the centre lies inside the rock would be
    // an overhang, which a ray from the centre cannot represent.
    for (const size of [0.3, 0.6, 0.9, 0.97]) {
      const scoop = scoopOf([0, 1, 0], size, 0.6);
      const distance = Math.sqrt(scoop.distance2);
      expect(Math.sqrt(distance * distance - scoop.radius * scoop.radius)).toBeGreaterThan(1.07);
      expect(distance - scoop.radius).toBeLessThan(1);
    }
  });

  it('lays every face inside its own chart, gutter excluded', () => {
    const params = rockParams({ subdivisions: 4 });
    const { uvs, vertexCount } = buildRock(params).mesh.pieces[0].attributes;
    const atlas = rockAtlas(params);
    const { chartPx, gutter } = atlas;
    const perFace = vertexCount / 6;

    for (let i = 0; i < vertexCount; i++) {
      const face = Math.floor(i / perFace);
      const column = face % ROCK_CHART_COLUMNS;
      const row = Math.floor(face / ROCK_CHART_COLUMNS);
      const x = uvs[i * 2] * atlas.width;
      const y = uvs[i * 2 + 1] * atlas.height;
      expect(x).toBeGreaterThanOrEqual(column * chartPx + gutter - 1e-3);
      expect(x).toBeLessThanOrEqual((column + 1) * chartPx - gutter + 1e-3);
      expect(y).toBeGreaterThanOrEqual(row * chartPx + gutter - 1e-3);
      expect(y).toBeLessThanOrEqual((row + 1) * chartPx - gutter + 1e-3);
    }
  });

  // A tier is the same cube at fewer quads a side, so its vertices are a
  // subset of the base's, positions and uvs alike: the chain shares one image.
  it('shares its uvs and surface across tiers', () => {
    const coarse = build({ subdivisions: 4 }).mesh.pieces[0].attributes;
    const fine = build({ subdivisions: 8 }).mesh.pieces[0].attributes;

    for (let face = 0; face < 6; face++)
      for (let j = 0; j <= 4; j++)
        for (let i = 0; i <= 4; i++) {
          const c = face * 25 + j * 5 + i;
          const f = face * 81 + j * 2 * 9 + i * 2;
          for (let k = 0; k < 3; k++) expect(fine.positions[f * 3 + k]).toBeCloseTo(coarse.positions[c * 3 + k], 6);
          for (let k = 0; k < 2; k++) expect(fine.uvs[f * 2 + k]).toBeCloseTo(coarse.uvs[c * 2 + k], 6);
        }
  });

  it("takes subdivisions as a tier override and nothing of a tree's", () => {
    const params = rockParams({ lods: [{ distance: 40, subdivisions: 6 }] });
    expect(tierParams(params, params.lods[0]).subdivisions).toBe(6);
    expect(() => rockParams({ lods: [{ distance: 40, radialSegments: 6 }] })).toThrow(
      /'radialSegments' applies to tree, crown, not to a rock's tier/
    );
  });

  it('rebuilds its image for a key that moves the surface, not for one that only tessellates it', () => {
    const base = rockParams();
    expect(sameTexture(base, rockParams({ subdivisions: 12 }))).toBe(true);
    expect(sameTexture(base, rockParams({ scoopDepth: 0.5 }))).toBe(false);
    expect(sameTexture(base, rockParams({ scoops: 0 }))).toBe(false);
    expect(sameTexture(base, rockParams({ height: 3 }))).toBe(false);
  });

  it('supports the hull at 26 mesh vertices that reach the mesh bounds', () => {
    const { mesh, metrics } = build();
    const { positions } = mesh.pieces[0].attributes;
    expect(metrics.hull).toHaveLength(26 * 3);

    const bounds = boundsOf(positions);
    const hull = boundsOf(new Float32Array(metrics.hull));
    for (let axis = 0; axis < 3; axis++) {
      expect(hull.min[axis]).toBeCloseTo(bounds.min[axis], 2);
      expect(hull.max[axis]).toBeCloseTo(bounds.max[axis], 2);
    }
  });

  it('emits a layer laid onto the slope with a hull and no wind', () => {
    const params = rockParams({ lods: [{ distance: 40, subdivisions: 6 }] });
    const rock = buildRock(params);
    const layer = rockLayer(params, rock);

    expect(layer.collider).toEqual({ type: 'hull', points: rock.metrics.hull });
    expect(layer.alignToNormal).toBe(1);
    expect(layer.yOffset).toBeLessThan(0);
    expect(layer.wind).toBeUndefined();
    expect(layer.foliage).toBeUndefined();
    expect(layer.impostor?.fromDistance).toBe(120);
    expect(layer.lodDistances).toEqual([40]);
    expect(() => scatterLayerEntry(layer)).not.toThrow();
  });

  it('writes one opaque material', () => {
    const params = rockParams({ subdivisions: 3 });
    const gltf = readGltf(writeGlb({ name: params.name, mesh: buildRock(params).mesh, textures: STONE_TEXTURES, alphaCutoff: 0 }));
    expect(gltf.materials).toHaveLength(1);
    expect(gltf.materials[0].alphaMode).toBe('OPAQUE');
    expect(gltf.meshes[0].primitives).toHaveLength(1);
  });

  it('ships a stone piece with a height map and a material', () => {
    expect(heightPieces('rock')).toEqual(['stone']);
    expect(materialPieces('rock')).toEqual(['stone']);
  });

  // The two sides of a chart seam are two mappings of one field, so what the
  // field says at the shared edge cannot depend on which chart asked.
  it('reads one field from either side of a face edge', () => {
    const { field } = build();
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [0, 0, 0];
    const c: [number, number, number] = [0, 0, 0];

    for (let t = 0; t <= 1; t += 0.125) {
      // +x face's top edge is +y face's +x edge, traversed the same way.
      surfaceAt(a, field, cubePoint(c, FACES[0], t, 1));
      surfaceAt(b, field, cubePoint(c, FACES[2], 1, t));
      for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k], 10);
      expect(crackMask(field, a[0], a[1], a[2], 0.05)).toBeCloseTo(crackMask(field, b[0], b[1], b[2], 0.05), 10);
    }
  });

  // A chart's gutter is the neighbouring face's surface continued past the
  // edge, so the first gutter texel of one chart lies on the same surface as
  // the last inner texel of the chart that shares the edge, and a crack that
  // crosses the edge is painted alike in both. Two controls: the same texels
  // matched the wrong way round, and two adjacent texels within one chart.
  // The pair across the seam has to be closer than either.
  it('paints a face edge alike in both charts that share it', () => {
    const params = rockParams({ textureSize: 256, cracks: 3 });
    const { field } = buildRock(params);
    const canvas = buildStoneCanvas(params, field);
    const atlas = rockAtlas(params);
    const inner = atlas.chartPx - atlas.gutter * 2;
    const half = 0.5 / inner;
    const uv: [number, number] = [0, 0];
    const texelAt = (face: number, a: number, b: number): number => {
      chartUv(uv, atlas, 0, face, a, b);
      return Math.floor(uv[1] * canvas.height) * canvas.width + Math.floor(uv[0] * canvas.width);
    };
    const gap = (a: number, b: number): number => {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += Math.abs(canvas.albedo[a * 3 + k] - canvas.albedo[b * 3 + k]);
      return sum / 3;
    };

    let matched = 0;
    let reversed = 0;
    let adjacent = 0;
    for (let i = 0; i < inner; i++) {
      const t = (i + 0.5) / inner;
      // +x's last inner row against +y's first gutter column past its +x edge.
      const innerX = texelAt(0, t, 1 - half);
      matched += gap(innerX, texelAt(2, 1 + half, t));
      reversed += gap(innerX, texelAt(2, 1 + half, 1 - t));
      adjacent += gap(innerX, texelAt(0, t, 1 - 3 * half));
    }

    expect(matched).toBeLessThan(reversed / 2);
    expect(matched).toBeLessThan(adjacent);
  });

  it('fills every texel of the image, gutters included', () => {
    const params = rockParams({ textureSize: 128 });
    const canvas = buildStoneCanvas(params, buildRock(params).field);
    expect(canvas.width).toBe(64 * 3);
    expect(canvas.height).toBe(64 * 2);
    for (let i = 0; i < canvas.width * canvas.height; i++) expect(canvas.alpha[i]).toBe(1);
  });

  it('reproduces a rock byte for byte from the same seed', () => {
    const build = (seed: number) => {
      const params = rockParams({ seed, subdivisions: 4 });
      return writeGlb({ name: params.name, mesh: buildRock(params).mesh, textures: STONE_TEXTURES, alphaCutoff: 0 });
    };
    expect(build(3).equals(build(3))).toBe(true);
    expect(build(3).equals(build(4))).toBe(false);
  });

  it('renders a preview with no hole', () => {
    const params = rockParams({ textureSize: 128, subdivisions: 6 });
    const rock = buildRock(params);
    const canvases = { stone: buildStoneCanvas(params, rock.field) };
    const size = 64;
    const pixels = renderPreview(params, rock.mesh, canvases, size);

    // The centre of the image is the middle of the rock. A hole there is the
    // background gradient showing through a face wound inside out.
    const centre = (size / 2) * size + size / 2;
    const backgroundBlue = pixels[centre * 3 + 2] > pixels[centre * 3] + 6;
    expect(backgroundBlue).toBe(false);
  });
});

describe('pebble clusters', () => {
  const pebbleParams = (extra: RawConfig = {}): Params =>
    resolveParams({ type: 'pebble', name: 'test-pebbles', seed: 11, textureSize: 128, ...extra });

  it('takes its defaults from the type', () => {
    const params = pebbleParams();
    expect(params.out).toBe('assets/shared/nature/pebbles');
    expect(params.cullDistance).toBe(60);
    expect(params.impostor).toBeNull();
    expect(params.castShadow).toBe(false);
    // Grain and shape only, until a config asks for more.
    expect(params.cracks).toBe(0);
    expect(params.plates).toBe(0);
    expect(params.weathering).toBe(0);
  });

  // The decision that replaced the shared skin atlas: a pebble config may name
  // any key a rock takes, because its bake is its own and every mark lands on
  // the stone that carries it.
  it('takes every key a rock takes', () => {
    for (const key of ['scoops', 'cracks', 'weathering', 'snow', 'plates', 'edgeWear', 'stoneTint'])
      expect(() => parseConfig({ type: 'pebble', name: 'a', [key]: key === 'stoneTint' ? '#808080' : 1 }, 'test.json')).not.toThrow();

    expect(() => parseConfig({ type: 'pebble', name: 'a', splits: 4 }, 'test.json')).toThrow(
      /'splits' applies to tree, not to type 'pebble'/
    );
    expect(() => parseConfig({ type: 'rock', name: 'a', pebblesPerModel: 4 }, 'test.json')).toThrow(
      /'pebblesPerModel' applies to pebble, not to type 'rock'/
    );
  });

  it('gives every pebble its own block of the image', () => {
    const params = pebbleParams({ pebblesPerModel: 7, subdivisions: 3 });
    const cluster = buildPebbleCluster(params);
    expect(cluster.pebbles).toHaveLength(7);

    // Seven blocks of 3x2 charts, in a grid that holds them all.
    const { atlas } = cluster;
    expect(atlas.columns * atlas.rows).toBeGreaterThanOrEqual(7);
    expect(atlas.width).toBe(atlas.chartPx * 3 * atlas.columns);
    expect(atlas.height).toBe(atlas.chartPx * 2 * atlas.rows);

    // No two pebbles address the same texels. Each block's charts are walked
    // through the mesh's own uvs, so this is what the renderer will sample.
    const { uvs, vertexCount } = cluster.mesh.pieces[0].attributes;
    const perPebble = vertexCount / 7;
    const blocks = new Set<number>();
    for (let i = 0; i < vertexCount; i++) {
      const column = Math.floor((uvs[i * 2] * atlas.width) / (atlas.chartPx * 3));
      const row = Math.floor((uvs[i * 2 + 1] * atlas.height) / (atlas.chartPx * 2));
      blocks.add(Math.floor(i / perPebble) * 1000 + row * atlas.columns + column);
    }
    // One block per pebble, and each pebble in exactly one.
    expect(blocks.size).toBe(7);
  });

  it('packs the pebbles without overlapping them', () => {
    const pebbles = packPebbles(pebbleParams({ pebblesPerModel: 14 }));
    expect(pebbles).toHaveLength(14);

    for (let i = 0; i < pebbles.length; i++)
      for (let j = i + 1; j < pebbles.length; j++) {
        const dx = pebbles[i].origin[0] - pebbles[j].origin[0];
        const dz = pebbles[i].origin[2] - pebbles[j].origin[2];
        // They may nestle, but a pebble never sits inside its neighbour.
        expect(Math.hypot(dx, dz)).toBeGreaterThan((pebbles[i].reach + pebbles[j].reach) * 0.85);
      }
  });

  it('orders the pebbles largest first and beds each into the ground', () => {
    const pebbles = packPebbles(pebbleParams({ pebblesPerModel: 9, pebbleSmallest: 0.3 }));
    const heights = pebbles.map((pebble) => pebble.field.extents[1]);

    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeLessThanOrEqual(heights[i - 1]);
    expect(heights[heights.length - 1] / heights[0]).toBeCloseTo(0.3, 2);
    // Each sits by its own share of its own height, not by the cluster's.
    for (const pebble of pebbles) expect(pebble.origin[1]).toBeLessThan(0);
  });

  // A tier is the same cluster at fewer quads a side. It has to land the same
  // stones in the same places under the same charts, or the handover slides.
  it('lands the same pebbles under the same charts across tiers', () => {
    const base = buildPebbleCluster(pebbleParams({ pebblesPerModel: 8, subdivisions: 6 }));
    const tier = buildPebbleCluster(pebbleParams({ pebblesPerModel: 8, subdivisions: 3 }));

    expect(tier.atlas).toEqual(base.atlas);
    base.pebbles.forEach((pebble, index) => expect(tier.pebbles[index].origin).toEqual(pebble.origin));
    expect(tier.mesh.pieces[0].attributes.triangleCount).toBeLessThan(
      base.mesh.pieces[0].attributes.triangleCount
    );
  });

  it('emits a layer with no collider and no impostor', () => {
    const params = pebbleParams();
    const cluster = buildPebbleCluster(params);
    const layer = pebbleLayer(params, cluster.metrics);

    expect(layer.collider).toBeUndefined();
    expect(layer.impostor).toBeUndefined();
    expect(layer.alignToNormal).toBe(1);
    // The cluster is to a pebble what a patch is to a tuft: one candidate for
    // all of them, so the footprint is never a single stone's, and never
    // under what the single-stone layer it replaces shipped at.
    expect(layer.footprint).toBeGreaterThanOrEqual(2.5);
    expect(layer.yOffset).toBeLessThan(0);
    expect(() => scatterLayerEntry(layer)).not.toThrow();
  });

  it('paints every block of the image', () => {
    const params = pebbleParams({ pebblesPerModel: 4, subdivisions: 3 });
    const cluster = buildPebbleCluster(params);
    const { stone } = buildPebbleCanvases(params, cluster);
    expect(stone.width).toBe(cluster.atlas.width);
    expect(stone.height).toBe(cluster.atlas.height);

    // The centre texel of every block carries a painted stone, so no block was
    // left as the zeroed canvas.
    cluster.pebbles.forEach((_, block) => {
      const origin: [number, number] = [0, 0];
      chartOrigin(origin, cluster.atlas, block, 0);
      const x = origin[0] + cluster.atlas.chartPx / 2;
      const y = origin[1] + cluster.atlas.chartPx / 2;
      const texel = y * stone.width + x;
      expect(stone.albedo[texel * 3] + stone.albedo[texel * 3 + 1] + stone.albedo[texel * 3 + 2]).toBeGreaterThan(0);
    });
  });

  // A rock is one block of one atlas, so every number the old constants gave
  // has to survive the move to a grid.
  it('leaves a rock as one block of 3x2 charts', () => {
    const params = resolveParams({ type: 'rock', name: 'a', seed: 1, textureSize: 1024 });
    const atlas = rockAtlas(params);

    expect(atlas.chartPx).toBe(rockChartPx(params));
    expect([atlas.columns, atlas.rows]).toEqual([1, 1]);
    expect([atlas.width, atlas.height]).toEqual([1536, 1024]);
    // The gutter a rock has always had, now stated as a proportion.
    expect(atlas.gutter).toBe(8);
    expect(gutterOf(64)).toBe(2);
    expect(chartAtlas(64, 14).gutter).toBe(2);
  });
});

describe('noise in three dimensions', () => {
  it('keeps gradient noise inside 0..1 and about its middle', () => {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    const samples = 4000;
    for (let i = 0; i < samples; i++) {
      const value = gradientNoise3((i * 0.37) % 9, (i * 0.71) % 7, (i * 0.53) % 5, 3);
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
    expect(sum / samples).toBeCloseTo(0.5, 1);
  });

  it('is the same field for the same seed and a different one otherwise', () => {
    expect(gradientNoise3(1.3, 2.7, 0.4, 5)).toBe(gradientNoise3(1.3, 2.7, 0.4, 5));
    expect(gradientNoise3(1.3, 2.7, 0.4, 5)).not.toBe(gradientNoise3(1.3, 2.7, 0.4, 6));
  });

  it('orders the two nearest feature points', () => {
    for (let i = 0; i < 200; i++) {
      const { f1, f2 } = worley3(i * 0.31, i * 0.17, i * 0.23, 9);
      expect(f1).toBeGreaterThanOrEqual(0);
      expect(f2).toBeGreaterThanOrEqual(f1);
      expect(f2).toBeLessThan(2);
    }
  });
});
