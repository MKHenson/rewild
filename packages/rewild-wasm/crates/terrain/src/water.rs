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
use math::{fast_max, fast_min, smoothstep};

/// Water types a water map blends: one RGBA8 texel.
pub const MAX_WATER_TYPES: usize = 4;

/// Metres above a covered level the swash can run up: water shows over ground
/// below it.
pub const SWASH_REACH: f64 = 1.5;
/// Metres above a covered level within which a chunk keeps its water map for
/// the terrain's wet band, though no water shows.
pub const WET_BAND_REACH: f64 = 2.0;

/// Metres past which all water counts as open: shore distances stop here.
pub const SHORE_CAP: f64 = 255.0;

/// The wet texels of a chunk's neighbours, which the shore distance reads in
/// place of the generated water and ground. Slot `(dy + 1) * 3 + dx + 1` holds
/// the neighbour `dx` texel columns and `dy` texel rows over, as a `size` ×
/// `size` plane of `wet` with 1 where water stands; bit `slot` of `present`
/// says the plane is there.
#[derive(Clone, Copy, Default)]
pub struct NeighbourWet<'a> {
    pub wet: &'a [u8],
    pub present: u32,
}

impl NeighbourWet<'_> {
    /// Whether water stands at texel (`mx`, `my`) of the chunk's texel grid
    /// extended past its edges, or None where no neighbour plane covers it.
    fn at(&self, size: usize, mx: isize, my: isize) -> Option<bool> {
        let last = size as isize - 1;
        let side = |m: isize| if m < 0 { (-1, m + last) } else if m > last { (1, m - last) } else { (0, m) };
        let ((dx, nx), (dy, ny)) = (side(mx), side(my));
        let slot = ((dy + 1) * 3 + dx + 1) as usize;
        if slot == 4 || self.present & (1 << slot) == 0 || !(0..=last).contains(&nx) || !(0..=last).contains(&ny) {
            return None;
        }
        Some(self.wet[slot * size * size + nx as usize + ny as usize * size] != 0)
    }
}

// A lagoon's water is lake water out to this share of its shore radius, then
// blends to sea water at the shore.
const LAGOON_BLEND_FROM: f64 = 0.2;

pub(crate) const OCEAN_WATER: &str = "ocean";
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
    /// Metres from each texel to the nearest dry texel, up to `SHORE_CAP`. 0
    /// where the texel is dry.
    pub shore: Vec<u8>,
    /// 1 where water stands at the texel: covered, over ground below the
    /// level. What a neighbour reads through `NeighbourWet`.
    pub wet: Vec<u8>,
}

/// The water map of a chunk with LOD-0 `heights`, or None when the ground
/// everywhere stands `WET_BAND_REACH` or more above the covered levels.
/// `neighbours` are the wet texels of edited neighbours, for the shore
/// distance.
#[allow(clippy::too_many_arguments)]
pub fn build_map(
    ground: &HeightGenerator,
    chunk_size: usize,
    step: usize,
    offset_x: f64,
    offset_y: f64,
    heights: &[f32],
    edit: Option<WaterEdit>,
    neighbours: NeighbourWet,
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

    let mut wet = vec![0u8; texels];
    for my in 0..size {
        for mx in 0..size {
            let t = mx + my * size;
            let height = heights[mx * step + my * step * chunk_size] as f64;
            wet[t] = (water.coverage[t] > 0 && height < water.levels[t]) as u8;
        }
    }
    let shore = shore_distance(ground, chunk_size, step, offset_x, offset_y, &wet, &water, neighbours);
    Some(WaterMap { water, base_level, max_level, shows, level, heights: relative, body_texels, shore, wet })
}

/// Metres from each texel of a chunk to the nearest dry texel, capped at
/// `SHORE_CAP`. Dry ground in neighbouring chunks counts: an apron a cap wide
/// is read around the chunk, only as far as a texel's distance could reach
/// past the chunk's edge. It reads a neighbour's own wet texels where
/// `neighbours` has them, else generated water and un-eroded ground.
#[allow(clippy::too_many_arguments)]
fn shore_distance(
    ground: &HeightGenerator,
    chunk_size: usize,
    step: usize,
    offset_x: f64,
    offset_y: f64,
    wet: &[u8],
    water: &ResolvedWater,
    neighbours: NeighbourWet,
) -> Vec<u8> {
    let size = water.size;
    let texel = step as f64 * ground.meters_per_sample();
    let dist_of = |w: u8| if w != 0 { SHORE_CAP } else { 0.0 };
    let mut dist: Vec<f64> = wet.iter().map(|&w| dist_of(w)).collect();
    if !wet.iter().any(|&w| w != 0) {
        return vec![0; size * size];
    }
    chamfer(&mut dist, size, texel);

    // Texels of apron each side must read: a texel's distance reaches past
    // an edge only as far as it exceeds its distance to that edge.
    let apron = (SHORE_CAP / texel).ceil() as usize;
    let mut reach = [0usize; 4];
    for my in 0..size {
        for mx in 0..size {
            let d = dist[mx + my * size];
            if d == 0.0 {
                continue;
            }
            let beyond = |edge: usize| {
                let k = (d / texel).ceil() as usize;
                k.saturating_sub(edge + 1).min(apron)
            };
            reach[0] = reach[0].max(beyond(mx));
            reach[1] = reach[1].max(beyond(size - 1 - mx));
            reach[2] = reach[2].max(beyond(my));
            reach[3] = reach[3].max(beyond(size - 1 - my));
        }
    }
    if reach.iter().any(|&r| r > 0) {
        let wide = size + 2 * apron;
        let field = chunk_size + 2 * apron * step;
        let mut wide_dist = vec![SHORE_CAP; wide * wide];
        let origin = field_origin(field, field, offset_x, offset_y);
        let mut sampler: Option<WaterSampler> = None;
        let (x0, x1) = (apron - reach[0], apron + size + reach[1]);
        let (y0, y1) = (apron - reach[2], apron + size + reach[3]);
        for wy in y0..y1 {
            for wx in x0..x1 {
                let w = wx + wy * wide;
                let inside = (apron..apron + size).contains(&wx) && (apron..apron + size).contains(&wy);
                if inside {
                    let t = (wx - apron) + (wy - apron) * size;
                    if dist[t] == 0.0 {
                        wide_dist[w] = 0.0;
                    }
                    continue;
                }
                let (mx, my) = (wx as isize - apron as isize, wy as isize - apron as isize);
                if let Some(neighbour_wet) = neighbours.at(size, mx, my) {
                    if !neighbour_wet {
                        wide_dist[w] = 0.0;
                    }
                    continue;
                }
                let (x, y) = ((wx * step) as f64, (wy * step) as f64);
                let sampler = sampler.get_or_insert_with(|| WaterSampler::new(ground, field, offset_x, offset_y, None));
                let point = sampler.sample(x, y);
                if point.coverage <= 0.0 {
                    wide_dist[w] = 0.0;
                    continue;
                }
                let (u, v) = (x + origin.0, y + origin.1);
                let mut height = ground.height_on(&sampler.grid, u, v);
                for lake in sampler.lakes() {
                    height = lake.carve(u, v, height);
                }
                if height >= point.level {
                    wide_dist[w] = 0.0;
                }
            }
        }
        chamfer(&mut wide_dist, wide, texel);
        for my in 0..size {
            for mx in 0..size {
                dist[mx + my * size] = wide_dist[(mx + apron) + (my + apron) * wide];
            }
        }
    }

    dist.iter().map(|&d| fast_min(d, SHORE_CAP).round() as u8).collect()
}

/// Two-pass chamfer distance in place over a `size` × `size` grid of `texel`
/// metre texels: zero texels are the sources, the rest start at their cap.
fn chamfer(dist: &mut [f64], size: usize, texel: f64) {
    let diagonal = texel * std::f64::consts::SQRT_2;
    for y in 0..size {
        for x in 0..size {
            let t = x + y * size;
            let mut d = dist[t];
            if d == 0.0 {
                continue;
            }
            if x > 0 {
                d = fast_min(d, dist[t - 1] + texel);
            }
            if y > 0 {
                d = fast_min(d, dist[t - size] + texel);
                if x > 0 {
                    d = fast_min(d, dist[t - size - 1] + diagonal);
                }
                if x + 1 < size {
                    d = fast_min(d, dist[t - size + 1] + diagonal);
                }
            }
            dist[t] = d;
        }
    }
    for y in (0..size).rev() {
        for x in (0..size).rev() {
            let t = x + y * size;
            let mut d = dist[t];
            if d == 0.0 {
                continue;
            }
            if x + 1 < size {
                d = fast_min(d, dist[t + 1] + texel);
            }
            if y + 1 < size {
                d = fast_min(d, dist[t + size] + texel);
                if x + 1 < size {
                    d = fast_min(d, dist[t + size + 1] + diagonal);
                }
                if x > 0 {
                    d = fast_min(d, dist[t + size - 1] + diagonal);
                }
            }
            dist[t] = d;
        }
    }
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
