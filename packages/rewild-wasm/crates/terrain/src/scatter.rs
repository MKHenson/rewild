//! Scatter placement: which instances of which layer stand where in a chunk. A
//! port of `scatterChunk` in `Scatter.ts`.
//!
//! Placement is a jittered grid in global sample space, so a cell belongs to
//! one world position whichever chunk resolves it, and neighbouring chunks
//! agree on their shared border. Each cell rolls one candidate, accepted
//! against the density the biome rules, the paint and the water resolve at its
//! position. A cell is twice the layer's footprint across, so density 1 packs
//! instances as tightly as the footprint allows.

use std::f64::consts::PI;

use serde::Deserialize;

use crate::climate::{ClimateField, ClimateGrid};
use crate::config::{Band, ClimateConfig, CoastConfig, ScatterRule};
use crate::lakes::field_origin;
use crate::paint::{ActiveBiomes, PaintMask};
use crate::splat::{band_coverage, coast_weights, gradient_at, selector_coverage, slope_at};
use crate::water::{WaterEdit, WaterPoint, WaterSampler};
use crate::HeightGenerator;
use math::{hash01, lerp, mix_hash, to_int32, ParkMiller, Simplex};

/// Floats per instance: position in chunk-local metres (3), rotation
/// quaternion xyzw (4), uniform scale, wind phase 0..1.
pub const INSTANCE_STRIDE: usize = 9;

// Bits per cell axis in a kill key; the layer slot takes the top 8.
const KILL_CELL_BITS: u32 = 12;
/// Cells per chunk axis a kill key can address. See `ScatterKillSet.ts`.
pub const KILL_CELL_LIMIT: f64 = (1 << KILL_CELL_BITS) as f64;

/// One row of the scatter layer library, in slot order. Only what placement
/// reads.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScatterLayer {
    pub name: String,
    /// Metres kept clear around an instance.
    pub footprint: f64,
    pub jitter: Jitter,
    /// 0 keeps instances upright, 1 lays them onto the slope.
    pub align_to_normal: Option<f64>,
    /// Metres above the surface.
    pub y_offset: Option<f64>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Jitter {
    pub scale: Band,
    /// Degrees about world up. A full turn without it.
    pub yaw: Option<Band>,
    /// Most degrees of lean from upright.
    pub tilt: Option<f64>,
}

/// An inclusive box of chunk samples.
#[derive(Clone, Copy)]
pub struct SampleBox {
    pub x0: f64,
    pub y0: f64,
    pub x1: f64,
    pub y1: f64,
}

/// What a chunk adds to placement.
#[derive(Default)]
pub struct ScatterRequest<'a> {
    /// Painted biomes, which grow their own scatter.
    pub biome_mask: Option<PaintMask<'a>>,
    /// Painted density: one channel per layer slot, then the exclusion
    /// channel. Ignored with any other channel count.
    pub density_mask: Option<PaintMask<'a>>,
    /// Kill keys of plucked instances, ascending.
    pub kills: &'a [u32],
    /// Places only the cells overlapping this box. The instances are the ones
    /// the whole chunk places there.
    pub region: Option<SampleBox>,
    /// Fill `LayerInstances::ids`.
    pub with_ids: bool,
    pub water_edit: Option<WaterEdit>,
}

/// One layer's instances in a chunk.
pub struct LayerInstances {
    pub slot: usize,
    pub count: usize,
    /// `count * INSTANCE_STRIDE` floats.
    pub data: Vec<f32>,
    /// Each instance's kill key, when asked for.
    pub ids: Vec<u32>,
}

/// The kill key of a chunk-relative cell: the layer slot, then the cell's y
/// and x. See `scatterKillKey`.
pub fn kill_key(slot: usize, rel_x: u32, rel_y: u32) -> u32 {
    ((slot as u32) << 24) | (rel_y << KILL_CELL_BITS) | rel_x
}

// A cell's hash, from its global cell coordinates.
fn cell_hash(cell_x: i64, cell_y: i64, slot: usize, seed: i32) -> u32 {
    let h = (cell_x as i32 as u32).wrapping_mul(0x9e37_79b1);
    let h = (h ^ cell_y as i32 as u32).wrapping_mul(0x85eb_ca6b);
    let h = (h ^ slot as u32).wrapping_mul(0xc2b2_ae35);
    mix_hash(h ^ seed as u32)
}

/// A rule's density at a sample, 0..1 of what the footprint allows: its
/// density scaled by each of its selectors. `noise` is its noise field there.
pub fn rule_density(rule: &ScatterRule, height: f64, slope: f64, noise: f64) -> f64 {
    rule.density
        * selector_coverage(rule.slope.as_ref(), slope)
        * selector_coverage(rule.height.as_ref(), height)
        * rule.noise.as_ref().map_or(1.0, |n| band_coverage(&n.band, noise))
}

/// The share of a rule's density its water conditions allow. `depth` is
/// metres below the surface, `coverage` the water there, `type_weight` the
/// weight of the rule's water type (1 with none) and `beach` the coast's share.
pub fn rule_water(rule: &ScatterRule, depth: f64, coverage: f64, type_weight: f64, beach: f64) -> f64 {
    if depth > 0.0 && coverage > 0.0 && !rule.underwater {
        return 0.0;
    }
    if rule.water_depth.is_none() && rule.water_type.is_none() {
        return if rule.underwater { 1.0 } else { 1.0 - beach };
    }
    coverage * type_weight * selector_coverage(rule.water_depth.as_ref(), depth)
}

type Quaternion = [f64; 4];

fn multiply(a: Quaternion, b: Quaternion) -> Quaternion {
    let [ax, ay, az, aw] = a;
    let [bx, by, bz, bw] = b;
    [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ]
}

/// The rotation taking world up onto `normal`, slerped out from identity by
/// `align`. Matches `quaternionFromUpToNormal` in ConformedPlacement, so a
/// scattered rock and a placed one lie on a slope the same way.
fn alignment(normal: [f64; 3], align: f64) -> Quaternion {
    let dot = normal[1];
    if dot > 0.9999 || align <= 0.0 {
        return [0.0, 0.0, 0.0, 1.0];
    }
    // Any axis in the plane serves an antiparallel normal; a half turn about z
    // is the choice ConformedPlacement makes.
    let (axis_x, axis_z, angle) = if dot < -0.9999 {
        (0.0, 1.0, PI)
    } else {
        // up × normal.
        let length = normal[2].hypot(normal[0]);
        (normal[2] / length, -normal[0] / length, dot.acos())
    };
    let half = angle * align * 0.5;
    let s = half.sin();
    [axis_x * s, 0.0, axis_z * s, half.cos()]
}

// Bilinear, because a candidate lands between samples and snapping it would
// step scatter down the height grid.
fn sample_height(heights: &[f32], size: usize, x: f64, y: f64) -> f64 {
    let max = (size - 1) as f64;
    let x0 = x.floor().clamp(0.0, max);
    let y0 = y.floor().clamp(0.0, max);
    let (x1, y1) = ((x0 + 1.0).min(max), (y0 + 1.0).min(max));
    let at = |x: f64, y: f64| heights[y as usize * size + x as usize] as f64;
    let (tx, ty) = (x - x0, y - y0);
    lerp(lerp(at(x0, y0), at(x1, y0), tx), lerp(at(x0, y1), at(x1, y1), tx), ty)
}

fn nearest(v: f64, size: usize) -> usize {
    v.round().clamp(0.0, (size - 1) as f64) as usize
}

/// Which rule grows a layer in each biome.
struct LayerRules {
    /// Per biome, the index of its rule for the layer.
    rule: Vec<Option<usize>>,
    /// Per biome, the water type its rule asks for.
    water_type: Vec<Option<usize>>,
    any: bool,
    /// The densest of the rules.
    max_density: f64,
}

pub struct ScatterGenerator {
    climate: ClimateConfig,
    layers: Vec<ScatterLayer>,
    /// Per layer slot.
    rules: Vec<LayerRules>,
    /// Per biome, per rule, its noise field's offset.
    noise: Vec<Vec<Option<(f64, f64)>>>,
    simplex: Simplex,
    field: ClimateField,
    seed: i32,
    sea_level: f64,
    meters_per_sample: f64,
}

impl ScatterGenerator {
    /// `layers` is the whole library in slot order.
    pub fn new(
        climate: ClimateConfig,
        layers: Vec<ScatterLayer>,
        seed: f64,
        sea_level: f64,
        meters_per_sample: f64,
    ) -> Result<Self, String> {
        let biomes = climate.biomes.len();
        let mut rules: Vec<LayerRules> = (0..layers.len())
            .map(|_| LayerRules { rule: vec![None; biomes], water_type: vec![None; biomes], any: false, max_density: 0.0 })
            .collect();
        let mut noise = Vec::with_capacity(biomes);
        for (b, biome) in climate.biomes.iter().enumerate() {
            for (r, rule) in biome.scatter.iter().enumerate() {
                let slot = layers
                    .iter()
                    .position(|l| l.name == rule.layer)
                    .ok_or_else(|| format!("Biome '{}' grows unknown scatter layer '{}'.", biome.name, rule.layer))?;
                let layer = &mut rules[slot];
                layer.rule[b] = Some(r);
                layer.water_type[b] =
                    rule.water_type.as_ref().and_then(|name| climate.water.iter().position(|w| &w.name == name));
                layer.any = true;
                layer.max_density = layer.max_density.max(rule.density);
            }
            noise.push(
                biome
                    .scatter
                    .iter()
                    .map(|rule| {
                        rule.noise.as_ref().map(|n| {
                            let mut rng = ParkMiller::new(seed + n.seed_salt);
                            let x = rng.offset();
                            (x, rng.offset())
                        })
                    })
                    .collect(),
            );
        }
        Ok(Self {
            field: ClimateField::new(seed, &climate),
            simplex: Simplex::new(seed),
            climate,
            layers,
            rules,
            noise,
            seed: to_int32(seed),
            sea_level,
            meters_per_sample,
        })
    }

    /// Every instance a `size` × `size` chunk at chunk offset (`offset_x`,
    /// `offset_y`) carries, by layer in slot order. `heights` are its LOD-0
    /// heights; `ground` the world's height generator, for its water.
    pub fn generate(
        &self,
        ground: &HeightGenerator,
        heights: &[f32],
        size: usize,
        offset_x: f64,
        offset_y: f64,
        request: ScatterRequest,
    ) -> Result<Vec<LayerInstances>, String> {
        if heights.len() != size * size {
            return Err(format!("Scatter needs {} heights, got {}.", size * size, heights.len()));
        }
        let exclude = self.layers.len();
        let density_mask = request.density_mask.as_ref().filter(|m| m.channels == exclude + 1);
        let slots: Vec<usize> = (0..self.layers.len())
            .filter(|&slot| self.rules[slot].any || density_mask.is_some_and(|m| !m.is_channel_empty(slot)))
            .collect();
        if slots.is_empty() {
            return Ok(Vec::new());
        }

        let climate = &self.climate;
        let origin = field_origin(size, size, offset_x, offset_y);
        let chunk = Chunk {
            heights,
            size,
            origin,
            span_start: (offset_x, offset_y),
            grid: self.field.grid(climate, &self.simplex, origin.0, origin.1, size, size),
            water: WaterSampler::new(ground, size, offset_x, offset_y, request.water_edit),
            coast: climate.continent.as_ref().and(climate.coast.as_ref()),
            biome_mask: request.biome_mask.as_ref(),
            density_mask,
            kills: request.kills,
            region: request.region,
            with_ids: request.with_ids,
        };
        let mut active = ActiveBiomes::new(climate, chunk.biome_mask);
        let mut results = Vec::new();
        for slot in slots {
            let layer = self.place(&chunk, slot, &mut active)?;
            if layer.count > 0 {
                results.push(layer);
            }
        }
        Ok(results)
    }

    /// One layer's instances in `chunk`.
    fn place(&self, chunk: &Chunk, slot: usize, active: &mut ActiveBiomes) -> Result<LayerInstances, String> {
        let climate = &self.climate;
        let layer = &self.layers[slot];
        let rules = &self.rules[slot];
        let size = chunk.size;
        let mps = self.meters_per_sample;
        let jitter = &layer.jitter;
        let (yaw_from, yaw_to) = jitter.yaw.map_or((0.0, 360.0), |b| (b.from, b.to));
        let tilt = jitter.tilt.unwrap_or(0.0);
        let align = layer.align_to_normal.unwrap_or(0.0).clamp(0.0, 1.0);
        let y_offset = layer.y_offset.unwrap_or(0.0);

        let cell_size = 2.0 * layer.footprint / mps;
        // A kill key addresses a cell within its chunk, so a footprint fine
        // enough to out-count that would leave instances no author could pluck.
        if (size - 1) as f64 / cell_size >= KILL_CELL_LIMIT {
            return Err(format!(
                "Scatter layer '{}' footprint {}m puts more than {} cells across a {size}-sample chunk.",
                layer.name, layer.footprint, KILL_CELL_LIMIT
            ));
        }

        // The chunk's half-open span in global sample space, so a candidate on
        // a shared edge belongs to one chunk only.
        let (start_x, start_y) = chunk.span_start;
        let (end_x, end_y) = (start_x + (size - 1) as f64, start_y + (size - 1) as f64);
        let half = (size - 1) as f64 / 2.0;
        let cell = |v: f64| (v / cell_size).floor() as i64;
        // Kill keys are relative to the chunk's own cell origin.
        let (cell_x0, cell_y0) = (cell(start_x), cell(start_y));
        let (mut from_x, mut to_x) = (cell_x0, cell(end_x));
        let (mut from_y, mut to_y) = (cell_y0, cell(end_y));
        if let Some(r) = chunk.region {
            from_x = from_x.max(cell(start_x + r.x0));
            to_x = to_x.min(cell(start_x + r.x1));
            from_y = from_y.max(cell(start_y + r.y0));
            to_y = to_y.min(cell(start_y + r.y1));
        }

        // A candidate is accepted when its roll falls below its density, and
        // no density exceeds the layer's densest rule unless paint raises it.
        // Rolls above that need nothing sampled. The slack covers rounding in
        // the biome weights' sum.
        let painted = chunk.density_mask.is_some_and(|m| !m.is_channel_empty(slot));
        let ceiling = if painted { 1.0 } else { rules.max_density * (1.0 + 1e-9) };

        let mut out = LayerInstances { slot, count: 0, data: Vec::new(), ids: Vec::new() };
        for cell_y in from_y..=to_y {
            for cell_x in from_x..=to_x {
                let key = kill_key(slot, (cell_x - cell_x0) as u32, (cell_y - cell_y0) as u32);
                if chunk.kills.binary_search(&key).is_ok() {
                    continue;
                }
                let hash = cell_hash(cell_x, cell_y, slot, self.seed);
                if hash01(hash, 2) >= ceiling {
                    continue;
                }
                let global_x = (cell_x as f64 + hash01(hash, 0)) * cell_size;
                let global_y = (cell_y as f64 + hash01(hash, 1)) * cell_size;
                if global_x < start_x || global_x >= end_x || global_y < start_y || global_y >= end_y {
                    continue;
                }
                let (sx, sy) = (global_x - start_x, global_y - start_y);
                let height = sample_height(chunk.heights, size, sx, sy);
                let slope = slope_at(chunk.heights, size, size, nearest(sx, size), nearest(sy, size), mps);

                // The biome-weighted sum of the rules that grow this layer, so
                // scatter fades in across a climate transition.
                let mut density = 0.0;
                if rules.any {
                    let (wx, wy) = (sx + chunk.origin.0, sy + chunk.origin.1);
                    active.resolve(climate, &chunk.grid.at(wx, wy), chunk.biome_mask, sx, sy);
                    let mut water: Option<(WaterPoint, f64)> = None;
                    for b in 0..active.count {
                        let biome = active.biomes[b];
                        let Some(r) = rules.rule[biome] else {
                            continue;
                        };
                        let rule = &climate.biomes[biome].scatter[r];
                        let noise = match (self.noise[biome][r], &rule.noise) {
                            (Some((ox, oy)), Some(n)) => {
                                (self.simplex.noise((wx + ox) / n.scale, (wy - oy) / n.scale) + 1.0) * 0.5
                            }
                            _ => 0.0,
                        };
                        let rule_density = rule_density(rule, height, slope, noise);
                        if rule_density <= 0.0 {
                            continue;
                        }
                        // Sampled once per candidate, and only once a rule
                        // wants to grow here.
                        let (point, beach) = *water.get_or_insert_with(|| {
                            let point = chunk.water.sample(sx, sy);
                            let above_sea = height - self.sea_level;
                            let beach = match chunk.coast {
                                Some(c) if point.ocean > 0.0 && above_sea < c.beach_height + c.blend => {
                                    coast_weights(c, above_sea, slope, point.ocean).0
                                }
                                _ => 0.0,
                            };
                            (point, beach)
                        });
                        let type_weight = rules.water_type[biome].map_or(1.0, |t| point.types.get(t).copied().unwrap_or(0.0));
                        density += active.weights[b]
                            * rule_density
                            * rule_water(rule, point.level - height, point.coverage, type_weight, beach);
                    }
                }

                if let Some(mask) = chunk.density_mask {
                    let painted = mask.sample_channel(slot, sx, sy);
                    let excluded = mask.sample_channel(self.layers.len(), sx, sy);
                    density = (density + painted * (1.0 - density)) * (1.0 - excluded);
                }
                if density <= 0.0 || hash01(hash, 2) >= density {
                    continue;
                }

                // Yaw about world up, leaned by the tilt jitter, then laid onto
                // the slope in world space so the yaw survives it.
                let scale = lerp(jitter.scale.from, jitter.scale.to, hash01(hash, 3));
                let half_yaw = lerp(yaw_from, yaw_to, hash01(hash, 4)).to_radians() * 0.5;
                let mut rotation = [0.0, half_yaw.sin(), 0.0, half_yaw.cos()];
                if tilt > 0.0 {
                    let lean = hash01(hash, 5) * tilt.to_radians();
                    let azimuth = hash01(hash, 6) * PI * 2.0;
                    let s = (lean * 0.5).sin();
                    rotation = multiply([azimuth.cos() * s, 0.0, azimuth.sin() * s, (lean * 0.5).cos()], rotation);
                }
                if align > 0.0 {
                    let (dx, dy) = gradient_at(chunk.heights, size, size, nearest(sx, size), nearest(sy, size), mps);
                    // The grid runs +y into -z, so dh/dy enters positively.
                    let (nx, nz) = (-dx, dy);
                    let length = (nx * nx + 1.0 + nz * nz).sqrt();
                    rotation = multiply(alignment([nx / length, 1.0 / length, nz / length], align), rotation);
                }

                out.data.extend_from_slice(&[
                    ((sx - half) * mps) as f32,
                    (height + y_offset) as f32,
                    ((half - sy) * mps) as f32,
                    rotation[0] as f32,
                    rotation[1] as f32,
                    rotation[2] as f32,
                    rotation[3] as f32,
                    scale as f32,
                    hash01(hash, 7) as f32,
                ]);
                if chunk.with_ids {
                    out.ids.push(key);
                }
                out.count += 1;
            }
        }
        Ok(out)
    }
}

/// One chunk's placement inputs, shared by its layers.
struct Chunk<'c> {
    heights: &'c [f32],
    size: usize,
    /// Lake space of sample (0, 0).
    origin: (f64, f64),
    /// The chunk's first sample in global sample space.
    span_start: (f64, f64),
    grid: ClimateGrid,
    water: WaterSampler,
    coast: Option<&'c CoastConfig>,
    biome_mask: Option<&'c PaintMask<'c>>,
    density_mask: Option<&'c PaintMask<'c>>,
    kills: &'c [u32],
    region: Option<SampleBox>,
    with_ids: bool,
}
