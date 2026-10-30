//! Where a chunk's water is, how high, and what kind. A port of `resolveWater`
//! and `buildWaterMap` in `WaterMap.ts`, with the water sampling of `Lakes.ts`
//! and the edit blend of `WaterEdit.ts`.
//!
//! Texels sit on chunk samples every `step` samples, so neighbouring chunks
//! share their edge texels. The ocean reads the climate grid the heights read,
//! so it follows exactly the coast that shaped the ground.

use crate::climate::{ocean_coverage, ClimateGrid};
use crate::config::ContinentConfig;
use crate::lakes::{field_origin, Lake, Lakes, LEVEL_REACH, OCEAN_BODY_ID};
use crate::HeightGenerator;
use math::{fast_max, smoothstep};

/// Water types a water map blends: one RGBA8 texel.
pub const MAX_WATER_TYPES: usize = 4;

/// Metres above a covered level the swash can run up: water shows over ground
/// below it.
pub const SWASH_REACH: f64 = 1.5;
/// Metres above a covered level within which a chunk keeps its water map for
/// the terrain's wet band, though no water shows.
pub const WET_BAND_REACH: f64 = 2.0;

// A lagoon's water is lake water out to this share of its shore radius, then
// blends to sea water at the shore.
const LAGOON_BLEND_FROM: f64 = 0.2;

const OCEAN_WATER: &str = "ocean";
const LAKE_WATER: &str = "lake";

// Planes of a water edit's mask. See `WaterEdit.ts`.
const EDIT_AUTHORITY: usize = 0;
const EDIT_COVERAGE: usize = 1;
const EDIT_TYPES: usize = 2;
pub const EDIT_CHANNELS: usize = EDIT_TYPES + MAX_WATER_TYPES;

/// A chunk's authored water: channel-major u8 planes of `size` × `size`
/// texels, one texel every `step` samples, with a level and a body per texel.
pub struct WaterEdit {
    pub size: usize,
    pub step: f64,
    pub weights: Vec<u8>,
    pub level: Vec<f32>,
    pub body_ids: Vec<u32>,
}

/// An edit at one point.
#[derive(Default)]
struct EditSample {
    authority: f64,
    coverage: f64,
    level: f64,
    body_id: u32,
    types: [f64; MAX_WATER_TYPES],
}

impl WaterEdit {
    /// Bilinear at sample (x, y). The level is weighted by each corner's
    /// authority, since a texel the edit does not own has no level; the body
    /// is the corner that owns most.
    fn sample(&self, x: f64, y: f64) -> EditSample {
        let max = self.size - 1;
        let (fx, fy) = (x / self.step, y / self.step);
        let x0 = (fast_max(fx.floor(), 0.0) as usize).min(max);
        let y0 = (fast_max(fy.floor(), 0.0) as usize).min(max);
        let x1 = if x0 < max { x0 + 1 } else { x0 };
        let y1 = if y0 < max { y0 + 1 } else { y0 };
        let tx = (fx - x0 as f64).clamp(0.0, 1.0);
        let ty = (fy - y0 as f64).clamp(0.0, 1.0);
        let plane = self.size * self.size;

        let mut out = EditSample::default();
        let (mut level_weight, mut owner) = (0.0, 0.0);
        for corner in 0..4 {
            let cx = if corner & 1 != 0 { x1 } else { x0 };
            let cy = if corner & 2 != 0 { y1 } else { y0 };
            let w = (if corner & 1 != 0 { tx } else { 1.0 - tx }) * (if corner & 2 != 0 { ty } else { 1.0 - ty });
            if w <= 0.0 {
                continue;
            }
            let t = cy * self.size + cx;
            let channel = |c: usize| self.weights[c * plane + t] as f64 / 255.0;
            let authority = channel(EDIT_AUTHORITY);
            out.authority += w * authority;
            out.coverage += w * channel(EDIT_COVERAGE);
            for (c, ty) in out.types.iter_mut().enumerate() {
                *ty += w * channel(EDIT_TYPES + c);
            }
            let owned = w * authority;
            if owned > 0.0 {
                out.level += owned * self.level[t] as f64;
                level_weight += owned;
                if owned > owner {
                    owner = owned;
                    out.body_id = self.body_ids[t];
                }
            }
        }
        if level_weight > 0.0 {
            out.level /= level_weight;
        }
        out
    }

    /// Blends the edit at sample (x, y) over the generated `water`. Each side
    /// counts by its coverage times its share of the authority, so an edit
    /// that removes water leaves the level alone.
    pub(crate) fn apply(&self, x: f64, y: f64, water: &mut WaterPoint) {
        let edit = self.sample(x, y);
        if edit.authority <= 0.0 {
            return;
        }
        let generated = water.coverage * (1.0 - edit.authority);
        let edited = edit.coverage * edit.authority;
        let total = generated + edited;
        water.coverage = total;
        if total <= 0.0 {
            water.types = [0.0; MAX_WATER_TYPES];
            return;
        }
        if edited > 0.0 {
            water.level = (generated * water.level + edited * edit.level) / total;
        }
        for (ty, edited_ty) in water.types.iter_mut().zip(edit.types) {
            *ty = (generated * *ty + edited * edited_ty) / total;
        }
        if edited >= generated {
            water.body_id = edit.body_id;
        }
    }
}

/// The water at one point.
#[derive(Clone, Copy, Debug, Default)]
pub struct WaterPoint {
    /// 0..1. Water shows where it is above zero and the ground is below the
    /// level.
    pub coverage: f64,
    /// World height of the surface.
    pub level: f64,
    /// The ocean's coverage.
    pub ocean: f64,
    /// The body that owns the point.
    pub body_id: u32,
    /// Weights over the climate's water palette.
    pub types: [f64; MAX_WATER_TYPES],
}

fn water_type(names: &[String], name: &str) -> Option<usize> {
    names.iter().position(|n| n == name).filter(|&i| i < MAX_WATER_TYPES)
}

/// The water of one chunk: the ocean from the continent, the lakes that reach
/// it, and its edit over both.
pub struct WaterSampler {
    lakes: Vec<Lake>,
    continent: Option<ContinentConfig>,
    grid: ClimateGrid,
    sea_level: f64,
    origin: (f64, f64),
    ocean_type: Option<usize>,
    lake_type: Option<usize>,
    edit: Option<WaterEdit>,
}

impl WaterSampler {
    /// The sampler for a `chunk_size` chunk at chunk offset (`offset_x`,
    /// `offset_y`).
    pub fn new(ground: &HeightGenerator, chunk_size: usize, offset_x: f64, offset_y: f64, edit: Option<WaterEdit>) -> Self {
        let climate = ground.climate();
        let names: Vec<String> = climate.water.iter().map(|w| w.name.clone()).collect();
        let origin = field_origin(chunk_size, chunk_size, offset_x, offset_y);
        Self {
            lakes: Lakes::of(ground).map_or_else(Vec::new, |l| l.in_field(chunk_size, chunk_size, offset_x, offset_y)),
            continent: climate.continent.clone(),
            grid: ground.climate_grid(origin.0, origin.1, chunk_size, chunk_size),
            sea_level: ground.sea_level(),
            origin,
            ocean_type: water_type(&names, OCEAN_WATER),
            lake_type: water_type(&names, LAKE_WATER),
            edit,
        }
    }

    /// The generated lakes that reach the chunk.
    pub fn lakes(&self) -> &[Lake] {
        &self.lakes
    }

    // The ocean's coverage at chunk sample (x, y), with an ocean type.
    fn ocean_at(&self, x: f64, y: f64) -> f64 {
        match (&self.continent, self.ocean_type) {
            (Some(c), Some(_)) => ocean_coverage(c, self.grid.at(x + self.origin.0, y + self.origin.1).continent),
            _ => 0.0,
        }
    }

    /// The water at chunk sample (x, y), in 0..chunk_size - 1.
    pub fn sample(&self, x: f64, y: f64) -> WaterPoint {
        let mut water = self.generated(x, y);
        if let Some(edit) = &self.edit {
            edit.apply(x, y, &mut water);
        }
        water
    }

    fn generated(&self, x: f64, y: f64) -> WaterPoint {
        let mut water = WaterPoint { level: self.sea_level, body_id: OCEAN_BODY_ID, ..Default::default() };
        let (u, v) = (x + self.origin.0, y + self.origin.1);
        for lake in &self.lakes {
            let (du, dv) = (u - lake.u, v - lake.v);
            let level_reach = lake.reach * LEVEL_REACH;
            if du * du + dv * dv >= level_reach * level_reach {
                continue;
            }
            let d = lake.distance(u, v);
            if d >= lake.bank * LEVEL_REACH {
                continue;
            }
            water.level = lake.level;
            water.body_id = lake.body_id;
            let coverage = if d < lake.bank { lake.coverage(d) } else { 0.0 };
            if lake.lagoon {
                self.lagoon(x, y, d, coverage, &mut water);
            } else if coverage > 0.0 {
                water.coverage = coverage;
                if let Some(t) = self.lake_type {
                    water.types[t] = 1.0;
                }
            }
            return water;
        }

        if self.continent.is_none() || self.ocean_type.is_none() {
            return water;
        }
        let coverage = self.ocean_at(x, y);
        water.ocean = coverage;
        if coverage > 0.0 {
            water.coverage = coverage;
            water.types[self.ocean_type.unwrap()] = 1.0;
        }
        water
    }

    // A lagoon shares the sea's level, so where the two overlap the water is
    // one surface: covered by either, owned by the lagoon while it covers the
    // point, and blending from lake water at the centre to sea water at the
    // shore.
    fn lagoon(&self, x: f64, y: f64, d: f64, lake_coverage: f64, water: &mut WaterPoint) {
        let ocean = self.ocean_at(x, y);
        water.ocean = ocean;
        if lake_coverage <= 0.0 {
            water.body_id = OCEAN_BODY_ID;
        }
        let coverage = fast_max(lake_coverage, ocean);
        if coverage <= 0.0 {
            return;
        }
        water.coverage = coverage;
        let to_sea = if lake_coverage > 0.0 { smoothstep(d, LAGOON_BLEND_FROM, 1.0) } else { 1.0 };
        if let Some(t) = self.lake_type {
            water.types[t] = 1.0 - to_sea;
        }
        if let Some(t) = self.ocean_type {
            water.types[t] += to_sea;
        }
    }
}

/// A chunk's water per texel before the terrain is consulted.
pub struct ResolvedWater {
    pub size: usize,
    pub step: usize,
    /// 0..255.
    pub coverage: Vec<u8>,
    /// World height of the surface.
    pub levels: Vec<f64>,
    /// RGBA8 palette weights, written where coverage > 0.
    pub type_weights: Vec<u8>,
    pub body_ids: Vec<u32>,
    pub lakes: Vec<Lake>,
    pub covered: bool,
}

/// The texels across a chunk of `chunk_size` samples, one every `step`.
pub fn water_map_size(chunk_size: usize, step: usize) -> usize {
    (chunk_size - 1) / step + 1
}

/// The water of a chunk at chunk offset (`offset_x`, `offset_y`), with its
/// edit blended over it. Needs no heights, so it resolves for chunks that are
/// not loaded.
pub fn resolve(
    ground: &HeightGenerator,
    chunk_size: usize,
    step: usize,
    offset_x: f64,
    offset_y: f64,
    edit: Option<WaterEdit>,
) -> ResolvedWater {
    let size = water_map_size(chunk_size, step);
    let texels = size * size;
    let sampler = WaterSampler::new(ground, chunk_size, offset_x, offset_y, edit);
    let mut coverage = vec![0u8; texels];
    let mut levels = vec![0.0; texels];
    let mut type_weights = vec![0u8; texels * 4];
    let mut body_ids = vec![0u32; texels];
    let mut covered = false;
    for my in 0..size {
        for mx in 0..size {
            let t = mx + my * size;
            let water = sampler.sample((mx * step) as f64, (my * step) as f64);
            let value = (water.coverage * 255.0).round() as u8;
            coverage[t] = value;
            levels[t] = water.level;
            body_ids[t] = water.body_id;
            if value > 0 {
                covered = true;
                for (c, &w) in water.types.iter().enumerate() {
                    type_weights[t * 4 + c] = (w * 255.0).round() as u8;
                }
            }
        }
    }
    ResolvedWater { size, step, coverage, levels, type_weights, body_ids, lakes: sampler.lakes, covered }
}

/// A chunk's water map. Levels and heights are f16 bits relative to the
/// chunk's lowest level, which keeps them precise near the waterline at any
/// world height.
pub struct WaterMap {
    pub water: ResolvedWater,
    pub base_level: f64,
    pub max_level: f64,
    /// Whether water shows anywhere. False keeps the map for the terrain's
    /// wet band alone.
    pub shows: bool,
    /// Water surface height − base level.
    pub level: Vec<u16>,
    /// Terrain height − base level.
    pub heights: Vec<u16>,
    /// The first texel each covering body owns, in texel order.
    pub body_texels: Vec<u32>,
}

/// The water map of a chunk with LOD-0 `heights`, or None when the ground
/// everywhere stands `WET_BAND_REACH` or more above the covered levels.
pub fn build_map(
    ground: &HeightGenerator,
    chunk_size: usize,
    step: usize,
    offset_x: f64,
    offset_y: f64,
    heights: &[f32],
    edit: Option<WaterEdit>,
) -> Option<WaterMap> {
    let climate = ground.climate();
    if climate.continent.is_none() && climate.lakes.is_none() && edit.is_none() {
        return None;
    }
    let water = resolve(ground, chunk_size, step, offset_x, offset_y, edit);
    if !water.covered {
        return None;
    }
    let size = water.size;
    let texels = size * size;

    // Water shows where a covered texel's footprint dips below its level, or
    // where the swash can run over it. The footprint reaches half a step
    // either side, so no full-resolution hollow is missed between texels.
    let reach = step / 2;
    let (mut shows, mut near) = (false, false);
    let (mut base_level, mut max_level) = (f64::INFINITY, f64::NEG_INFINITY);
    for my in 0..size {
        for mx in 0..size {
            let t = mx + my * size;
            if water.coverage[t] == 0 {
                continue;
            }
            let level = water.levels[t];
            base_level = base_level.min(level);
            max_level = max_level.max(level);
            if shows {
                continue;
            }
            let (x0, x1) = ((mx * step).saturating_sub(reach), (mx * step + reach).min(chunk_size - 1));
            let (y0, y1) = ((my * step).saturating_sub(reach), (my * step + reach).min(chunk_size - 1));
            'footprint: for y in y0..=y1 {
                for x in x0..=x1 {
                    let height = heights[x + y * chunk_size] as f64;
                    if height < level + WET_BAND_REACH {
                        near = true;
                    }
                    if height < level + SWASH_REACH {
                        shows = true;
                        break 'footprint;
                    }
                }
            }
        }
    }
    if !near {
        return None;
    }

    let mut body_texels = Vec::new();
    let mut seen: Vec<u32> = Vec::new();
    for t in 0..texels {
        let id = water.body_ids[t];
        if water.coverage[t] == 0 || seen.contains(&id) {
            continue;
        }
        seen.push(id);
        body_texels.push(t as u32);
    }

    let mut level = vec![0u16; texels];
    let mut relative = vec![0u16; texels];
    for my in 0..size {
        for mx in 0..size {
            let t = mx + my * size;
            level[t] = to_f16(water.levels[t] - base_level);
            relative[t] = to_f16(heights[mx * step + my * step * chunk_size] as f64 - base_level);
        }
    }

    Some(WaterMap { water, base_level, max_level, shows, level, heights: relative, body_texels })
}

/// IEEE half-precision bits for `value` rounded to f32, then to nearest even,
/// as `toFloat16` in `float16.ts`.
pub fn to_f16(value: f64) -> u16 {
    let bits = (value as f32).to_bits();
    let sign = ((bits >> 16) & 0x8000) as u16;
    let exponent = ((bits >> 23) & 0xff) as i32;
    let mut mantissa = bits & 0x7f_ffff;

    if exponent == 0xff {
        return sign | 0x7c00 | if mantissa != 0 { 0x200 } else { 0 };
    }
    let e = exponent - 127 + 15;
    if e >= 0x1f {
        return sign | 0x7c00;
    }
    if e <= 0 {
        if e < -10 {
            return sign;
        }
        mantissa |= 0x80_0000;
        let shift = (14 - e) as u32;
        let mut half = mantissa >> shift;
        let rest = mantissa & ((1 << shift) - 1);
        let midpoint = 1 << (shift - 1);
        if rest > midpoint || (rest == midpoint && half & 1 != 0) {
            half += 1;
        }
        return sign | half as u16;
    }
    // A carry out of the mantissa rolls into the exponent, which is the
    // correct rounding up to the next power of two.
    let mut half = sign as u32 | ((e as u32) << 10) | (mantissa >> 13);
    let rest = mantissa & 0x1fff;
    if rest > 0x1000 || (rest == 0x1000 && half & 1 != 0) {
        half += 1;
    }
    half as u16
}
