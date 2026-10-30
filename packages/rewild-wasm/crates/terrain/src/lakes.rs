//! Seeded lakes: at most one per cell of a coarse grid. A lake is a pure
//! function of the seed, the climate and its cell, so any chunk rebuilds every
//! lake that reaches it with no data from other chunks.
//!
//! Positions are in lake space, the world sample positions the height
//! generator reads (see `heights`).

use std::f64::consts::PI;

use serde::Serialize;

use crate::climate::ocean_coverage;
use crate::config::{Band, LakeConfig};
use crate::HeightGenerator;
use math::{fast_max, fast_min, hash01, hash_cell, lerp, smoothstep, to_int32};

pub const OCEAN_BODY_ID: u32 = 0;

// Rim points sampled around a candidate to level it.
const RIM_SAMPLES: usize = 24;

// Share of the shore's wander each harmonic carries, and its frequency.
const SHAPE_WEIGHTS: [f64; 3] = [0.5, 0.3, 0.2];
const SHAPE_FREQUENCIES: [f64; 3] = [2.0, 3.0, 5.0];

/// A lake's level reaches this multiple of its bank, past where its coverage
/// ends, so the linearly filtered surface does not sag toward the next level
/// at the shore.
pub const LEVEL_REACH: f64 = 1.25;

// Share of the bank, from the shore outward, that keeps full coverage.
const FULL_COVERAGE: f64 = 0.5;

// A lagoon's mouth: a channel cut through its bank toward the sea, this many
// metres below sea level and this many radians either side of its bearing.
const MOUTH_DEPTH: f64 = 2.0;
const MOUTH_HALF_ANGLE: f64 = PI / 10.0;
// Share of the shore radius inside the shore where the channel starts.
const MOUTH_START: f64 = 0.8;

// How far a candidate out at sea may slide ashore to become a lagoon, as a
// share of the cell, and the step it slides in.
const COAST_SHIFT: f64 = 0.4;
const COAST_STEP: f64 = 0.02;
// Metres above sea level that count as ashore for a sliding candidate.
const ASHORE: f64 = 1.0;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Lake {
    pub cell_x: i32,
    pub cell_y: i32,
    pub body_id: u32,
    /// Centre, in lake space.
    pub u: f64,
    pub v: f64,
    /// A small lake settled in a cirque, where a lake was too steep.
    pub tarn: bool,
    /// Open to the sea: at sea level, with no lip on its seaward side.
    pub lagoon: bool,
    /// Bearing of a lagoon's mouth in lake space, in radians; NaN for a lake.
    pub mouth: f64,
    /// Mean shore radius, in samples.
    pub radius: f64,
    /// Bank reach as a multiple of the shore radius.
    pub bank: f64,
    /// Where the lip eases back to the ground, as a multiple of the shore
    /// radius.
    pub outer: f64,
    /// Furthest the lake shapes the ground from its centre, in samples.
    pub reach: f64,
    /// Metres from the level to the bed at the centre.
    pub depth: f64,
    /// World height of the surface.
    pub level: f64,
    /// The least height the bank's top is raised to, so the water stays in.
    pub lip: f64,
    /// The lowest point of the rim: the highest the level can rise.
    pub spill_height: f64,
    pub irregularity: f64,
    #[serde(skip)]
    pub phases: [f64; 3],
}

/// The body ID a generated lake takes from its cell. Never the ocean's.
pub fn lake_body_id(cell_x: i32, cell_y: i32) -> u32 {
    (((cell_x & 0x7fff) as u32) << 16) | (cell_y as u32 & 0xffff) | 0x8000_0000
}

// The shore radius toward `angle`, as a multiple of the mean radius.
fn shore_shape(irregularity: f64, phases: &[f64; 3], angle: f64) -> f64 {
    let mut wander = 0.0;
    for i in 0..SHAPE_WEIGHTS.len() {
        wander += SHAPE_WEIGHTS[i] * (SHAPE_FREQUENCIES[i] * angle + phases[i]).sin();
    }
    1.0 + irregularity * wander
}

impl Lake {
    /// Distance from the centre to (u, v) as a multiple of the shore radius in
    /// that direction: below 1 is under water, 1..bank is the bank.
    pub fn distance(&self, u: f64, v: f64) -> f64 {
        let (du, dv) = (u - self.u, v - self.v);
        let shore = self.radius * shore_shape(self.irregularity, &self.phases, dv.atan2(du));
        (du * du + dv * dv).sqrt() / shore
    }

    /// The ground at (u, v) once the lake has shaped it: a bowl below the level
    /// inside the shore, rising across the bank to the ground or the lip,
    /// whichever is higher, then easing back to `height` by the outer edge.
    pub fn carve(&self, u: f64, v: f64, height: f64) -> f64 {
        let (du, dv) = (u - self.u, v - self.v);
        if du * du + dv * dv >= self.reach * self.reach {
            return height;
        }
        let d = self.distance(u, v);
        if d >= self.outer {
            return height;
        }
        let carved = if d < 1.0 {
            self.level - self.depth * (1.0 - d * d)
        } else {
            let lipped = fast_max(height, self.lip);
            if d < self.bank {
                lerp(self.level, lipped, smoothstep(d, 1.0, self.bank))
            } else {
                lerp(lipped, height, smoothstep(d, self.bank, self.outer))
            }
        };
        if self.mouth.is_nan() || d < MOUTH_START {
            return carved;
        }
        fast_min(carved, self.mouth_height(du, dv, d, carved))
    }

    // The floor of a lagoon's mouth, blending out to `carved` either side of
    // its bearing and past the bank.
    fn mouth_height(&self, du: f64, dv: f64, d: f64, carved: f64) -> f64 {
        let mut off = dv.atan2(du) - self.mouth;
        off -= (off / (PI * 2.0)).round() * PI * 2.0;
        let across = 1.0 - smoothstep(off.abs(), MOUTH_HALF_ANGLE * 0.5, MOUTH_HALF_ANGLE);
        if across <= 0.0 {
            return carved;
        }
        let along = 1.0 - smoothstep(d, self.bank, self.outer);
        lerp(carved, self.level - MOUTH_DEPTH, across * along)
    }

    /// How much water the lake holds at distance `d`: all of it to halfway up
    /// the bank, fading to none at its top.
    pub fn coverage(&self, d: f64) -> f64 {
        let full = 1.0 + (self.bank - 1.0) * FULL_COVERAGE;
        1.0 - smoothstep(d, full, self.bank)
    }
}

/// What became of one lake cell's roll, for debugging.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    #[serde(rename = "no roll")]
    NoRoll,
    #[serde(rename = "crowded")]
    Crowded,
    #[serde(rename = "ocean")]
    Ocean,
    #[serde(rename = "too steep")]
    TooSteep,
    #[serde(rename = "too steep for a tarn")]
    TooSteepForTarn,
    #[serde(rename = "too steep for a lagoon")]
    TooSteepForLagoon,
    #[serde(rename = "missed the sea")]
    MissedTheSea,
    #[serde(rename = "lake")]
    Lake,
    #[serde(rename = "tarn")]
    Tarn,
    #[serde(rename = "lagoon")]
    Lagoon,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CellReport {
    pub cell_x: i32,
    pub cell_y: i32,
    pub outcome: Outcome,
    /// The candidate's centre in lake space; NaN with no roll.
    pub u: f64,
    pub v: f64,
    /// Degrees, at lake and then tarn size; NaN where not sampled.
    pub rim_slope: f64,
    pub tarn_slope: f64,
    pub lake: Option<Lake>,
}

impl CellReport {
    fn new(cell_x: i32, cell_y: i32) -> Self {
        Self {
            cell_x,
            cell_y,
            outcome: Outcome::NoRoll,
            u: f64::NAN,
            v: f64::NAN,
            rim_slope: f64::NAN,
            tarn_slope: f64::NAN,
            lake: None,
        }
    }
}

struct Candidate {
    cell_x: i32,
    cell_y: i32,
    hash: u32,
    u: f64,
    v: f64,
    radius: f64,
    reach: f64,
    /// Slid ashore from the sea: settles as a lagoon or not at all.
    ashore: bool,
}

// Of two candidates too close to both stand, the one with the higher hash
// wins; every chunk sees the same pair and makes the same choice.
fn outranks(a: &Candidate, b: &Candidate) -> bool {
    if a.hash != b.hash {
        return a.hash > b.hash;
    }
    if a.cell_x != b.cell_x {
        a.cell_x > b.cell_x
    } else {
        a.cell_y > b.cell_y
    }
}

fn rejected(report: &mut Option<&mut CellReport>, outcome: Outcome) -> Option<Lake> {
    if let Some(r) = report.as_deref_mut() {
        r.outcome = outcome;
    }
    None
}

fn pick(band: &Band, t: f64) -> f64 {
    lerp(band.from, band.to, t)
}

fn slope_degrees(rise: f64, run: f64) -> f64 {
    (rise / run).atan().to_degrees()
}

/// What sampling a candidate's rim found.
struct Rim {
    /// Degrees of the whole rim's spread.
    slope: f64,
    lowest: f64,
    highest: f64,
    /// Rim points standing in the sea.
    wet: usize,
    /// Degrees of the rim's spread with the sea counted at sea level.
    ashore_slope: f64,
    /// Bearing of the lowest rim point in the sea; NaN with none.
    mouth: f64,
}

/// The lakes of one world.
pub struct Lakes<'a> {
    ground: &'a HeightGenerator,
    config: &'a LakeConfig,
    seed: i32,
}

impl<'a> Lakes<'a> {
    /// The world's lakes, or None when its climate has none.
    pub fn of(ground: &'a HeightGenerator) -> Option<Self> {
        let config = ground.climate().lakes.as_ref()?;
        Some(Self { ground, config, seed: to_int32(ground.seed() + config.seed_salt) })
    }

    fn reach_of(&self, radius: f64) -> f64 {
        let c = self.config;
        radius * (1.0 + c.irregularity) * (c.bank + c.moraine)
    }

    /// The furthest any lake reaches from its centre, in samples.
    pub fn max_reach(&self) -> f64 {
        let c = self.config;
        let tarn = c.tarns.as_ref().map_or(0.0, |t| t.radius.to);
        let lagoon = if c.lagoon_chance > 0.0 { c.lagoon_radius.to } else { 0.0 };
        self.reach_of(c.radius.to.max(tarn).max(lagoon))
    }

    // How far a candidate may move from its seeded place, in samples.
    fn max_shift(&self) -> f64 {
        if self.config.lagoon_chance > 0.0 {
            self.config.cell_size * COAST_SHIFT
        } else {
            0.0
        }
    }

    // Cells either side a candidate can collide with.
    fn spacing_range(&self) -> i32 {
        let clear = 2.0 * self.max_reach() + self.config.spacing + 2.0 * self.max_shift();
        1 + (clear / self.config.cell_size).ceil() as i32
    }

    fn ground_at(&self, u: f64, v: f64) -> f64 {
        self.ground.sample(u, v).height
    }

    // In the sea, not merely below sea level: the ocean's coverage reaches a
    // little way over dry land.
    fn in_sea(&self, height: f64, continent: f64) -> bool {
        match &self.ground.climate().continent {
            Some(c) => height < self.ground.sea_level() && ocean_coverage(c, continent) > 0.0,
            None => false,
        }
    }

    fn candidate(&self, cell_x: i32, cell_y: i32) -> Option<Candidate> {
        let c = self.config;
        let hash = hash_cell(cell_x, cell_y, self.seed);
        if hash01(hash, 0) >= c.chance {
            return None;
        }
        let radius = pick(&c.radius, hash01(hash, 1));
        // Spaced by the larger of the lake and the tarn the site might settle as.
        let tarn_radius = c.tarns.as_ref().map_or(0.0, |t| pick(&t.radius, hash01(hash, 1)));
        let mut candidate = Candidate {
            cell_x,
            cell_y,
            hash,
            u: (cell_x as f64 + hash01(hash, 2)) * c.cell_size,
            v: (cell_y as f64 + hash01(hash, 3)) * c.cell_size,
            radius,
            reach: self.reach_of(radius.max(tarn_radius)),
            ashore: false,
        };
        if hash01(hash, 8) < c.lagoon_chance {
            self.slide_ashore(&mut candidate);
        }
        Some(candidate)
    }

    // Moves a candidate that fell out at sea up the continent field to just
    // behind the shore, where its rim reaches back into the sea and it can
    // settle as a lagoon. Left where it is when no shore is within reach.
    fn slide_ashore(&self, c: &mut Candidate) {
        let sea_level = self.ground.sea_level();
        if self.ground.climate().continent.is_none() || self.ground_at(c.u, c.v) >= sea_level {
            return;
        }
        let e = self.config.cell_size * COAST_STEP;
        let continent = |u: f64, v: f64| self.ground.continent(u, v);
        let gu = continent(c.u + e, c.v) - continent(c.u - e, c.v);
        let gv = continent(c.u, c.v + e) - continent(c.u, c.v - e);
        let length = gu.hypot(gv);
        if length == 0.0 {
            return;
        }
        let (du, dv) = (gu / length, gv / length);

        let steps = (COAST_SHIFT / COAST_STEP).floor() as usize;
        for i in 1..=steps {
            let u = c.u + du * e * i as f64;
            let v = c.v + dv * e * i as f64;
            if self.ground_at(u, v) < sea_level + ASHORE {
                continue;
            }
            // Sized as a lagoon, and set back from the shore by its radius so
            // the shore lies inside the rim.
            c.radius = pick(&self.config.lagoon_radius, hash01(c.hash, 1));
            c.reach = self.reach_of(c.radius);
            c.ashore = true;
            c.u = u + du * c.radius;
            c.v = v + dv * c.radius;
            return;
        }
    }

    fn is_spaced(&self, c: &Candidate) -> bool {
        let range = self.spacing_range();
        for dy in -range..=range {
            for dx in -range..=range {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let Some(other) = self.candidate(c.cell_x + dx, c.cell_y + dy) else {
                    continue;
                };
                if !outranks(&other, c) {
                    continue;
                }
                let (du, dv) = (other.u - c.u, other.v - c.v);
                let clear = other.reach + c.reach + self.config.spacing;
                if du * du + dv * dv < clear * clear {
                    return false;
                }
            }
        }
        true
    }

    // Samples the pre-lake ground on the top of the bank of a lake of mean
    // shore `radius`.
    fn sample_rim(&self, c: &Candidate, radius: f64, phases: &[f64; 3]) -> Rim {
        let config = self.config;
        let sea_level = self.ground.sea_level();
        let (mut lowest, mut highest) = (f64::INFINITY, f64::NEG_INFINITY);
        let (mut lowest_ashore, mut highest_ashore) = (f64::INFINITY, f64::NEG_INFINITY);
        let mut wet = 0;
        let (mut mouth, mut mouth_height) = (f64::NAN, f64::INFINITY);
        for k in 0..RIM_SAMPLES {
            let angle = k as f64 / RIM_SAMPLES as f64 * PI * 2.0;
            let r = radius * shore_shape(config.irregularity, phases, angle) * config.bank;
            let s = self.ground.sample(c.u + angle.cos() * r, c.v + angle.sin() * r);
            let h = s.height;
            if self.in_sea(h, s.continent) {
                wet += 1;
                if h < mouth_height {
                    mouth_height = h;
                    mouth = angle;
                }
            }
            lowest = fast_min(lowest, h);
            highest = fast_max(highest, h);
            let ashore = fast_max(h, sea_level);
            lowest_ashore = fast_min(lowest_ashore, ashore);
            highest_ashore = fast_max(highest_ashore, ashore);
        }
        // Judged as a slope, so a small lake can sit on a shelf too steep for a
        // large one.
        let run = radius * config.bank * self.ground.meters_per_sample();
        Rim {
            slope: slope_degrees(highest - lowest, run),
            lowest,
            highest,
            wet,
            ashore_slope: slope_degrees(highest_ashore - lowest_ashore, run),
            mouth,
        }
    }

    // Levels a spaced candidate from its rim, or rejects it: out at sea, or on
    // ground too steep to hold water. A lake sits below its lowest rim; a tarn
    // part way up it, behind a lip. A lake whose rim stands in the sea opens to
    // it as a lagoon at sea level.
    fn settle(&self, c: &Candidate, mut report: Option<&mut CellReport>) -> Option<Lake> {
        let config = self.config;
        let sea_level = self.ground.sea_level();
        let centre = self.ground.sample(c.u, c.v);
        if self.in_sea(centre.height, centre.continent) {
            return rejected(&mut report, Outcome::Ocean);
        }

        let mut phases = [0.0; 3];
        for (i, phase) in phases.iter_mut().enumerate() {
            *phase = hash01(c.hash, 5 + i as u32) * PI * 2.0;
        }

        let mut radius = c.radius;
        let rim = self.sample_rim(c, radius, &phases);
        if let Some(r) = report.as_deref_mut() {
            r.rim_slope = rim.slope;
        }
        let lagoon = rim.wet > 0;
        if c.ashore && !lagoon {
            return rejected(&mut report, Outcome::MissedTheSea);
        }
        let mut level = if lagoon { sea_level } else { rim.lowest - config.margin };
        let mut spill_height = if lagoon { sea_level } else { rim.lowest };

        // The sea holds a lagoon's seaward side, so only its dry rim is judged.
        if lagoon {
            if let Some(r) = report.as_deref_mut() {
                r.rim_slope = rim.ashore_slope;
            }
            if rim.ashore_slope > config.max_lagoon_slope {
                return rejected(&mut report, Outcome::TooSteepForLagoon);
            }
        } else if rim.slope > config.max_rim_slope {
            let Some(tarns) = &config.tarns else {
                return rejected(&mut report, Outcome::TooSteep);
            };
            radius = pick(&tarns.radius, hash01(c.hash, 1));
            let tarn_rim = self.sample_rim(c, radius, &phases);
            if let Some(r) = report.as_deref_mut() {
                r.tarn_slope = tarn_rim.slope;
            }
            if tarn_rim.wet > 0 {
                return rejected(&mut report, Outcome::Ocean);
            }
            if tarn_rim.slope > tarns.max_rim_slope {
                return rejected(&mut report, Outcome::TooSteepForTarn);
            }
            level = tarn_rim.lowest + (tarn_rim.highest - tarn_rim.lowest) * tarns.lip_share;
            spill_height = level + config.margin;
        }

        Some(Lake {
            cell_x: c.cell_x,
            cell_y: c.cell_y,
            body_id: lake_body_id(c.cell_x, c.cell_y),
            u: c.u,
            v: c.v,
            tarn: radius != c.radius,
            lagoon,
            mouth: if lagoon { rim.mouth } else { f64::NAN },
            radius,
            bank: config.bank,
            outer: config.bank + config.moraine,
            reach: self.reach_of(radius),
            depth: pick(&config.depth, hash01(c.hash, 4)),
            level,
            lip: if lagoon { f64::NEG_INFINITY } else { level + config.margin },
            spill_height,
            irregularity: config.irregularity,
            phases,
        })
    }

    /// Every lake whose bank reaches the lake-space box [u0, u1] × [v0, v1].
    pub fn find(&self, u0: f64, v0: f64, u1: f64, v1: f64) -> Vec<Lake> {
        let reach = self.max_reach() + self.max_shift();
        let size = self.config.cell_size;
        let cell = |x: f64| (x / size).floor() as i32;
        let mut lakes = Vec::new();
        for cell_y in cell(v0 - reach)..=cell(v1 + reach) {
            for cell_x in cell(u0 - reach)..=cell(u1 + reach) {
                let Some(c) = self.candidate(cell_x, cell_y) else {
                    continue;
                };
                if c.u + c.reach < u0 || c.u - c.reach > u1 || c.v + c.reach < v0 || c.v - c.reach > v1 {
                    continue;
                }
                if !self.is_spaced(&c) {
                    continue;
                }
                if let Some(lake) = self.settle(&c, None) {
                    lakes.push(lake);
                }
            }
        }
        lakes
    }

    /// What every lake cell overlapping the lake-space box did: rolled
    /// nothing, lost to a neighbour, or settled or failed and why. Slow; for
    /// debugging.
    pub fn inspect(&self, u0: f64, v0: f64, u1: f64, v1: f64) -> Vec<CellReport> {
        let size = self.config.cell_size;
        let cell = |x: f64| (x / size).floor() as i32;
        let mut reports = Vec::new();
        for cell_y in cell(v0)..=cell(v1) {
            for cell_x in cell(u0)..=cell(u1) {
                let mut report = CellReport::new(cell_x, cell_y);
                if let Some(c) = self.candidate(cell_x, cell_y) {
                    report.u = c.u;
                    report.v = c.v;
                    if !self.is_spaced(&c) {
                        report.outcome = Outcome::Crowded;
                    } else if let Some(lake) = self.settle(&c, Some(&mut report)) {
                        report.outcome = if lake.lagoon {
                            Outcome::Lagoon
                        } else if lake.tarn {
                            Outcome::Tarn
                        } else {
                            Outcome::Lake
                        };
                        report.lake = Some(lake);
                    }
                }
                reports.push(report);
            }
        }
        reports
    }

    /// The lakes reaching a `width` × `height` field at chunk offset
    /// (`offset_x`, `offset_y`).
    pub fn in_field(&self, width: usize, height: usize, offset_x: f64, offset_y: f64) -> Vec<Lake> {
        let (u0, v0) = field_origin(width, height, offset_x, offset_y);
        self.find(u0, v0, u0 + width as f64 - 1.0, v0 + height as f64 - 1.0)
    }

    /// Carves every lake reaching a generated field in place.
    pub fn carve(&self, heights: &mut [f32], width: usize, height: usize, offset_x: f64, offset_y: f64) {
        let (u0, v0) = field_origin(width, height, offset_x, offset_y);
        for lake in self.in_field(width, height, offset_x, offset_y) {
            let span = |centre: f64, origin: f64, size: usize| {
                let from = fast_max((centre - lake.reach - origin).ceil(), 0.0) as usize;
                let to = fast_min((centre + lake.reach - origin).floor(), size as f64 - 1.0);
                (from, to)
            };
            let (x0, x1) = span(lake.u, u0, width);
            let (y0, y1) = span(lake.v, v0, height);
            if x1 < 0.0 || y1 < 0.0 {
                continue;
            }
            for y in y0..=y1 as usize {
                for x in x0..=x1 as usize {
                    let i = x + y * width;
                    heights[i] = lake.carve(x as f64 + u0, y as f64 + v0, heights[i] as f64) as f32;
                }
            }
        }
    }
}

/// Lake space of sample (0, 0) of a field at chunk offset (`offset_x`,
/// `offset_y`).
pub fn field_origin(width: usize, height: usize, offset_x: f64, offset_y: f64) -> (f64, f64) {
    (offset_x - width as f64 / 2.0, -offset_y - height as f64 / 2.0)
}
