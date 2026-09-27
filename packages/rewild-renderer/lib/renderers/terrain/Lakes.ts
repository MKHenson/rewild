import { Vector2, hash01, hashCell, lerp, smoothstep } from 'rewild-common';
import { ClimateConfig, LakeConfig } from './Biomes';
import { ClimateField, oceanCoverage, sampleContinent } from './ClimateField';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { GroundSampler, createGroundSampler, sampleGround } from './Noise';
import { LAKE_WATER, OCEAN_WATER, getWaterTypeIndex } from './Water';

// Seeded lakes: at most one per cell of a coarse grid. A lake is a pure
// function of the seed, the climate and its cell, so any chunk rebuilds every
// lake that reaches it with no data from other chunks.
//
// Positions are in lake space: the world's sample coordinates as the height
// noise reads them. A field of width W and height H at chunk offset o puts its
// sample (x, y) at (x - W/2 + o.x, y - H/2 - o.y).

export const OCEAN_BODY_ID = 0;

// Rim points sampled around a candidate to level it.
const RIM_SAMPLES = 24;

// Share of the shore's wander each harmonic carries, and its frequency.
const SHAPE_WEIGHTS = [0.5, 0.3, 0.2];
const SHAPE_FREQUENCIES = [2, 3, 5];

// A lake's level reaches this multiple of its bank, past where its coverage
// ends, so the linearly filtered surface does not sag toward the next level
// at the shore.
const LEVEL_REACH = 1.25;

// Share of the bank, from the shore outward, that keeps full coverage.
const FULL_COVERAGE = 0.5;

export interface Lake {
  cellX: number;
  cellY: number;
  bodyId: number;
  /** Centre, in lake space. */
  u: number;
  v: number;
  /** A small lake settled in a cirque, where a lake was too steep. */
  tarn: boolean;
  /** Mean shore radius, in samples. */
  radius: number;
  /** Bank reach as a multiple of the shore radius. */
  bank: number;
  /** Where the lip eases back to the ground, as a multiple of the shore radius. */
  outer: number;
  /** Furthest the lake shapes the ground from its centre, in samples. */
  reach: number;
  /** Metres from the level to the bed at the centre. */
  depth: number;
  /** World height of the surface. */
  level: number;
  /** The least height the bank's top is raised to, so the water stays in. */
  lip: number;
  irregularity: number;
  phases: Float64Array;
}

interface Candidate {
  cellX: number;
  cellY: number;
  hash: number;
  u: number;
  v: number;
  radius: number;
  reach: number;
}

/** The body ID a generated lake takes from its cell. Never the ocean's. */
export function lakeBodyId(cellX: number, cellY: number): number {
  return (((cellX & 0x7fff) << 16) | (cellY & 0xffff) | 0x80000000) >>> 0;
}

/** How far a lake of mean shore `radius` shapes the ground, in samples. */
function lakeReach(config: LakeConfig, radius: number): number {
  return radius * (1 + config.irregularity) * (config.bank + config.moraine);
}

/** The furthest any lake in `config` reaches from its centre, in samples. */
export function maxLakeReach(config: LakeConfig): number {
  const tarns = config.tarns;
  return lakeReach(
    config,
    Math.max(config.radius.to, tarns ? tarns.radius.to : 0)
  );
}

function lakeCandidate(
  config: LakeConfig,
  seed: number,
  cellX: number,
  cellY: number
): Candidate | null {
  const hash = hashCell(cellX, cellY, seed + config.seedSalt);
  if (hash01(hash, 0) >= config.chance) return null;
  const radius = lerp(config.radius.from, config.radius.to, hash01(hash, 1));
  // Spaced by the larger of the lake and the tarn the site might settle as.
  const tarns = config.tarns;
  const tarnRadius = tarns
    ? lerp(tarns.radius.from, tarns.radius.to, hash01(hash, 1))
    : 0;
  return {
    cellX,
    cellY,
    hash,
    u: (cellX + hash01(hash, 2)) * config.cellSize,
    v: (cellY + hash01(hash, 3)) * config.cellSize,
    radius,
    reach: lakeReach(config, Math.max(radius, tarnRadius)),
  };
}

// Of two candidates too close to both stand, the one with the higher hash
// wins; every chunk sees the same pair and makes the same choice.
function outranks(a: Candidate, b: Candidate): boolean {
  if (a.hash !== b.hash) return a.hash > b.hash;
  return a.cellX !== b.cellX ? a.cellX > b.cellX : a.cellY > b.cellY;
}

function isSpaced(config: LakeConfig, seed: number, c: Candidate): boolean {
  // Two reaches are each under a cell, so a rival more than two cells away
  // can never be close enough.
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      const other = lakeCandidate(config, seed, c.cellX + dx, c.cellY + dy);
      if (!other || !outranks(other, c)) continue;
      const du = other.u - c.u;
      const dv = other.v - c.v;
      const clear = other.reach + c.reach + config.spacing;
      if (du * du + dv * dv < clear * clear) return false;
    }
  }
  return true;
}

// The shore radius toward `angle`, as a multiple of the mean radius.
function shoreShape(
  irregularity: number,
  phases: Float64Array,
  angle: number
): number {
  let wander = 0;
  for (let i = 0; i < SHAPE_WEIGHTS.length; i++)
    wander +=
      SHAPE_WEIGHTS[i] * Math.sin(SHAPE_FREQUENCIES[i] * angle + phases[i]);
  return 1 + irregularity * wander;
}

/**
 * Distance from the lake's centre to (u, v) as a multiple of the shore radius
 * in that direction: below 1 is under water, 1..bank is the bank.
 */
export function lakeDistance(lake: Lake, u: number, v: number): number {
  const du = u - lake.u;
  const dv = v - lake.v;
  const shore =
    lake.radius *
    shoreShape(lake.irregularity, lake.phases, Math.atan2(dv, du));
  return Math.sqrt(du * du + dv * dv) / shore;
}

// Scratch for sampleRim: the lowest and highest rim heights.
const _rim = new Float64Array(2);

// Samples the pre-lake ground on the top of the bank of a lake of mean shore
// `radius` into _rim, and returns the rim's slope in degrees; NaN when the
// ocean reaches the rim.
function sampleRim(
  config: LakeConfig,
  c: Candidate,
  radius: number,
  phases: Float64Array,
  ground: GroundSampler
): number {
  const continent = ground.field.climate.continent;
  let lowest = Infinity;
  let highest = -Infinity;
  for (let k = 0; k < RIM_SAMPLES; k++) {
    const angle = (k / RIM_SAMPLES) * Math.PI * 2;
    const r =
      radius * shoreShape(config.irregularity, phases, angle) * config.bank;
    const u = c.u + Math.cos(angle) * r;
    const v = c.v + Math.sin(angle) * r;
    if (
      continent &&
      oceanCoverage(continent, sampleContinent(ground.field, u, v)) > 0
    )
      return NaN;
    const h = sampleGround(ground, u, v);
    if (h < lowest) lowest = h;
    if (h > highest) highest = h;
  }
  _rim[0] = lowest;
  _rim[1] = highest;
  // Judged as a slope, so a small lake can sit on a shelf too steep for a
  // large one.
  const rimMetres = radius * config.bank * TERRAIN_METERS_PER_SAMPLE;
  return (Math.atan((highest - lowest) / rimMetres) * 180) / Math.PI;
}

// Levels a spaced candidate from its rim, or rejects it: over the ocean's
// reach, or on ground too steep to hold water. A lake sits below its lowest
// rim; a tarn part way up it, behind a lip.
function settleLake(
  config: LakeConfig,
  c: Candidate,
  ground: GroundSampler,
  report?: LakeCellReport
): Lake | null {
  const phases = new Float64Array(SHAPE_WEIGHTS.length);
  for (let i = 0; i < phases.length; i++)
    phases[i] = hash01(c.hash, 5 + i) * Math.PI * 2;

  let radius = c.radius;
  let slope = sampleRim(config, c, radius, phases, ground);
  if (report) report.rimSlope = slope;
  if (Number.isNaN(slope)) {
    if (report) report.outcome = 'ocean';
    return null;
  }
  let level = _rim[0] - config.margin;

  if (slope > config.maxRimSlope) {
    const tarns = config.tarns;
    if (!tarns) {
      if (report) report.outcome = 'too steep';
      return null;
    }
    radius = lerp(tarns.radius.from, tarns.radius.to, hash01(c.hash, 1));
    slope = sampleRim(config, c, radius, phases, ground);
    if (report) report.tarnSlope = slope;
    if (Number.isNaN(slope) || slope > tarns.maxRimSlope) {
      if (report)
        report.outcome = Number.isNaN(slope) ? 'ocean' : 'too steep for a tarn';
      return null;
    }
    level = _rim[0] + (_rim[1] - _rim[0]) * tarns.lipShare;
  }

  return {
    cellX: c.cellX,
    cellY: c.cellY,
    bodyId: lakeBodyId(c.cellX, c.cellY),
    u: c.u,
    v: c.v,
    tarn: radius !== c.radius,
    radius,
    bank: config.bank,
    outer: config.bank + config.moraine,
    reach: lakeReach(config, radius),
    depth: lerp(config.depth.from, config.depth.to, hash01(c.hash, 4)),
    level,
    lip: level + config.margin,
    irregularity: config.irregularity,
    phases,
  };
}

/**
 * Every lake whose bank reaches the lake-space box [u0, u1] × [v0, v1].
 */
export function findLakes(
  seed: number,
  climate: ClimateConfig,
  seaLevel: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number
): Lake[] {
  const config = climate.lakes;
  if (!config) return [];

  const reach = maxLakeReach(config);
  const size = config.cellSize;
  const cellX0 = Math.floor((u0 - reach) / size);
  const cellX1 = Math.floor((u1 + reach) / size);
  const cellY0 = Math.floor((v0 - reach) / size);
  const cellY1 = Math.floor((v1 + reach) / size);

  const lakes: Lake[] = [];
  let ground: GroundSampler | null = null;
  for (let cellY = cellY0; cellY <= cellY1; cellY++) {
    for (let cellX = cellX0; cellX <= cellX1; cellX++) {
      const c = lakeCandidate(config, seed, cellX, cellY);
      if (!c) continue;
      if (
        c.u + c.reach < u0 ||
        c.u - c.reach > u1 ||
        c.v + c.reach < v0 ||
        c.v - c.reach > v1
      )
        continue;
      if (!isSpaced(config, seed, c)) continue;

      ground ??= createGroundSampler(seed, climate, seaLevel);
      const lake = settleLake(config, c, ground);
      if (lake) lakes.push(lake);
    }
  }
  return lakes;
}

/** What became of one lake cell's roll, for debugging. */
export interface LakeCellReport {
  cellX: number;
  cellY: number;
  outcome:
    | 'no roll'
    | 'crowded'
    | 'ocean'
    | 'too steep'
    | 'too steep for a tarn'
    | 'lake'
    | 'tarn';
  /** The candidate's centre in lake space; NaN with no roll. */
  u: number;
  v: number;
  /** Degrees, at lake and then tarn size; NaN where not sampled. */
  rimSlope: number;
  tarnSlope: number;
  lake: Lake | null;
}

/**
 * What every lake cell overlapping the lake-space box did: rolled nothing,
 * lost to a neighbour, or settled or failed and why. Slow; for debugging.
 */
export function inspectLakeCells(
  seed: number,
  climate: ClimateConfig,
  seaLevel: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number
): LakeCellReport[] {
  const config = climate.lakes;
  if (!config) return [];

  const size = config.cellSize;
  const ground = createGroundSampler(seed, climate, seaLevel);
  const reports: LakeCellReport[] = [];
  for (
    let cellY = Math.floor(v0 / size);
    cellY <= Math.floor(v1 / size);
    cellY++
  ) {
    for (
      let cellX = Math.floor(u0 / size);
      cellX <= Math.floor(u1 / size);
      cellX++
    ) {
      const report: LakeCellReport = {
        cellX,
        cellY,
        outcome: 'no roll',
        u: NaN,
        v: NaN,
        rimSlope: NaN,
        tarnSlope: NaN,
        lake: null,
      };
      reports.push(report);
      const c = lakeCandidate(config, seed, cellX, cellY);
      if (!c) continue;
      report.u = c.u;
      report.v = c.v;
      if (!isSpaced(config, seed, c)) {
        report.outcome = 'crowded';
        continue;
      }
      const lake = settleLake(config, c, ground, report);
      if (!lake) continue;
      report.lake = lake;
      report.outcome = lake.tarn ? 'tarn' : 'lake';
    }
  }
  return reports;
}

/** Lake space from world metres, written into `out` as [u, v]. */
export function worldToLakeSpace(
  x: number,
  z: number,
  out: Float64Array
): void {
  out[0] = x / TERRAIN_METERS_PER_SAMPLE - 0.5;
  out[1] = -z / TERRAIN_METERS_PER_SAMPLE - 0.5;
}

/** World metres from lake space, written into `out` as [x, z]. */
export function lakeSpaceToWorld(
  u: number,
  v: number,
  out: Float64Array
): void {
  out[0] = (u + 0.5) * TERRAIN_METERS_PER_SAMPLE;
  out[1] = -(v + 0.5) * TERRAIN_METERS_PER_SAMPLE;
}

/**
 * The ground at a lake-space point once `lake` has shaped it: a bowl below the
 * level inside the shore, rising across the bank to the ground or the lip,
 * whichever is higher, then easing back to `height` by the lake's outer edge.
 */
export function carveLakeHeight(
  lake: Lake,
  u: number,
  v: number,
  height: number
): number {
  const du = u - lake.u;
  const dv = v - lake.v;
  if (du * du + dv * dv >= lake.reach * lake.reach) return height;

  const d = lakeDistance(lake, u, v);
  if (d >= lake.outer) return height;
  if (d < 1) return lake.level - lake.depth * (1 - d * d);
  const lipped = Math.max(height, lake.lip);
  if (d < lake.bank)
    return lerp(lake.level, lipped, smoothstep(d, 1, lake.bank));
  return lerp(
    lipped,
    height,
    smoothstep(d, lake.bank, lake.outer)
  );
}

/**
 * Carves every lake reaching a generated `width` × `height` field in place.
 * `offset` is the field's chunk offset, as the height generator takes it.
 */
export function carveLakes(
  heights: Float32Array,
  width: number,
  height: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig,
  seaLevel: number
): void {
  if (!climate.lakes) return;

  const originU = offset.x - width / 2;
  const originV = -offset.y - height / 2;
  const lakes = findLakes(
    seed,
    climate,
    seaLevel,
    originU,
    originV,
    originU + width - 1,
    originV + height - 1
  );

  for (const lake of lakes) {
    const x0 = Math.max(0, Math.ceil(lake.u - lake.reach - originU));
    const x1 = Math.min(width - 1, Math.floor(lake.u + lake.reach - originU));
    const y0 = Math.max(0, Math.ceil(lake.v - lake.reach - originV));
    const y1 = Math.min(height - 1, Math.floor(lake.v + lake.reach - originV));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = x + y * width;
        heights[i] = carveLakeHeight(
          lake,
          x + originU,
          y + originV,
          heights[i]
        );
      }
    }
  }
}

// How much water a lake holds at distance `d` (see lakeDistance): all of it to
// halfway up the bank, fading to none at its top.
function lakeCoverage(lake: Lake, d: number): number {
  const full = 1 + (lake.bank - 1) * FULL_COVERAGE;
  return 1 - smoothstep(d, full, lake.bank);
}

/**
 * Where the water is in one chunk: the ocean from the continent, and the lakes
 * that reach it. sampleWater writes its answer into the fields below.
 */
export interface WaterSampler {
  field: ClimateField;
  lakes: Lake[];
  seaLevel: number;
  originU: number;
  originV: number;
  oceanType: number;
  lakeType: number;
  /** Surface height at the last sample. */
  level: number;
  /** The ocean's coverage at the last sample. */
  ocean: number;
  /** The body that owns the last sample. */
  bodyId: number;
}

/** A water sampler over `field`, a chunk field at chunk offset `offset`. */
export function createWaterSampler(
  field: ClimateField,
  seed: number,
  offset: Vector2,
  seaLevel: number
): WaterSampler {
  const climate = field.climate;
  const originU = offset.x - field.halfWidth;
  const originV = -offset.y - field.halfHeight;
  return {
    field,
    lakes: findLakes(
      seed,
      climate,
      seaLevel,
      originU,
      originV,
      originU + field.halfWidth * 2 - 1,
      originV + field.halfHeight * 2 - 1
    ),
    seaLevel,
    originU,
    originV,
    oceanType: getWaterTypeIndex(climate, OCEAN_WATER),
    lakeType: getWaterTypeIndex(climate, LAKE_WATER),
    level: seaLevel,
    ocean: 0,
    bodyId: OCEAN_BODY_ID,
  };
}

/**
 * The water's coverage at chunk sample (x, y), 0..1, with the palette's type
 * weights written into `types`. Also sets the sampler's level, ocean and
 * bodyId. Water shows where coverage is above zero and the ground is below
 * the level.
 */
export function sampleWater(
  s: WaterSampler,
  x: number,
  y: number,
  types: Float64Array
): number {
  types.fill(0);
  s.level = s.seaLevel;
  s.ocean = 0;
  s.bodyId = OCEAN_BODY_ID;

  const u = x + s.originU;
  const v = y + s.originV;
  for (let i = 0; i < s.lakes.length; i++) {
    const lake = s.lakes[i];
    const du = u - lake.u;
    const dv = v - lake.v;
    const levelReach = lake.reach * LEVEL_REACH;
    if (du * du + dv * dv >= levelReach * levelReach) continue;

    const d = lakeDistance(lake, u, v);
    if (d >= lake.bank * LEVEL_REACH) continue;
    s.level = lake.level;
    s.bodyId = lake.bodyId;
    const coverage = d < lake.bank ? lakeCoverage(lake, d) : 0;
    if (coverage > 0 && s.lakeType >= 0 && s.lakeType < types.length)
      types[s.lakeType] = 1;
    return coverage;
  }

  const continent = s.field.climate.continent;
  if (!continent || s.oceanType < 0) return 0;
  const coverage = oceanCoverage(continent, sampleContinent(s.field, x, y));
  s.ocean = coverage;
  if (coverage > 0 && s.oceanType < types.length) types[s.oceanType] = 1;
  return coverage;
}
