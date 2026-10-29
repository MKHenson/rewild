//! Which biome(s) a world position is in, and the continent field. A port of
//! the climate half of `ClimateField.ts`.
//!
//! Every function takes a world sample position: `x` grows east, `y` grows
//! north, matching lake space in `Lakes.ts`. A chunk converts its own samples
//! once, so a field never depends on which chunk evaluates it.
//!
//! The fields are evaluated on a world-aligned grid and interpolated, so a
//! point query and a chunk agree exactly.

use crate::config::{ClimateAxis, ClimateConfig, ContinentConfig};
use math::{smoothstep01, F64x2, ParkMiller, Simplex};

// Domain warp of the climate lookup, so biome borders meander. In samples.
// WARP_AMPLITUDE / WARP_SAMPLE_SCALE must stay below 0.18, or the warp folds
// and a border becomes a discontinuity.
const WARP_SAMPLE_SCALE: f64 = 2800.0;
const WARP_AMPLITUDE: f64 = 350.0;
const WARP_SALT: f64 = 5501.0;

const CONTINENT_OCTAVES: usize = 4;
const CONTINENT_PERSISTENCE: f64 = 0.5;
const CONTINENT_LACUNARITY: f64 = 2.0;
// (1 - 0.5^4) / (1 - 0.5)
const CONTINENT_MAX_AMPLITUDE: f64 = 1.875;

/// Biomes blended at one sample, at most four, with weights summing to 1.
#[derive(Clone, Copy, Default)]
pub struct BiomeBlend {
    pub biomes: [usize; 4],
    pub weights: [f64; 4],
    pub count: usize,
}

impl BiomeBlend {
    fn add(&mut self, biome: usize, weight: f64) {
        if weight == 0.0 {
            return;
        }
        for i in 0..self.count {
            if self.biomes[i] == biome {
                self.weights[i] += weight;
                return;
            }
        }
        self.biomes[self.count] = biome;
        self.weights[self.count] = weight;
        self.count += 1;
    }
}

/// The band an axis value falls in, and the smoothstep blend into the next
/// band inside a cut's transition zone. `b == a` with weight 0 outside one.
#[derive(Clone, Copy, Default)]
struct AxisBands {
    a: usize,
    b: usize,
    weight: f64,
}

fn resolve_axis(value: f64, axis: &ClimateAxis) -> AxisBands {
    let cuts = &axis.cuts;
    let half = axis.blend_half_width;

    let mut band = 0;
    while band < cuts.len() && value >= cuts[band] {
        band += 1;
    }

    if band < cuts.len() && value > cuts[band] - half {
        let t = (value - (cuts[band] - half)) / (2.0 * half);
        return AxisBands { a: band, b: band + 1, weight: t * t * (3.0 - 2.0 * t) };
    }
    if band > 0 && value < cuts[band - 1] + half {
        let t = (value - (cuts[band - 1] - half)) / (2.0 * half);
        return AxisBands { a: band - 1, b: band, weight: t * t * (3.0 - 2.0 * t) };
    }
    AxisBands { a: band, b: band, weight: 0.0 }
}

/// How much of the land height survives at continent value `c`: 1 inland, 0
/// on the sea bed.
pub fn continent_land_weight(continent: &ContinentConfig, c: f64) -> f64 {
    let half = continent.blend_half_width;
    smoothstep01((c - (continent.coast - half)) / (2.0 * half))
}

/// Metres below sea level of the sea bed at continent value `c`.
pub fn continent_seabed_depth(continent: &ContinentConfig, c: f64) -> f64 {
    let u = continent.coast - c;
    if u <= 0.0 {
        return 0.0;
    }
    let shelf = continent.shelf_depth * (u / continent.shelf_width).min(1.0);
    let t = (u - continent.shelf_width) / continent.slope_width;
    if t <= 0.0 {
        return shelf;
    }
    shelf + (continent.ocean_depth - continent.shelf_depth) * smoothstep01(t)
}

fn coastal_moisture_at(continent: &ContinentConfig, c: f64) -> f64 {
    let amount = continent.coastal_moisture.unwrap_or(0.0);
    let reach = continent.coastal_moisture_reach.unwrap_or(0.0);
    if amount == 0.0 || reach <= 0.0 {
        return 0.0;
    }
    amount * (1.0 - smoothstep01((c - continent.coast) / reach))
}

/// The seeded offsets of every climate field.
pub struct ClimateField {
    temperature: (f64, f64),
    moisture: (f64, f64),
    warp: (f64, f64),
    continent: [(f64, f64); CONTINENT_OCTAVES],
}

fn offsets(seed: f64, salt: f64) -> (f64, f64) {
    let mut rng = ParkMiller::new(seed + salt);
    let x = rng.offset();
    (x, rng.offset())
}

impl ClimateField {
    pub fn new(seed: f64, climate: &ClimateConfig) -> Self {
        let mut continent = [(0.0, 0.0); CONTINENT_OCTAVES];
        if let Some(c) = &climate.continent {
            let mut rng = ParkMiller::new(seed + c.seed_salt);
            for octave in continent.iter_mut() {
                let x = rng.offset();
                *octave = (x, rng.offset());
            }
        }
        Self {
            temperature: offsets(seed, climate.temperature.seed_salt),
            moisture: offsets(seed, climate.moisture.seed_salt),
            warp: offsets(seed, WARP_SALT),
            continent,
        }
    }

    /// The continent field at (x, y), in 0..1. Below `coast` is ocean. 1 for a
    /// climate with no continent.
    fn continent(&self, climate: &ClimateConfig, simplex: &Simplex, x: f64, y: f64) -> f64 {
        let Some(continent) = &climate.continent else {
            return 1.0;
        };
        // The octaves are independent, so they run two to a SIMD call.
        let mut amplitude = [0.0; CONTINENT_OCTAVES];
        let mut sx = [0.0; CONTINENT_OCTAVES];
        let mut sy = [0.0; CONTINENT_OCTAVES];
        let (mut a, mut frequency) = (1.0, 1.0);
        for (o, &(ox, oy)) in self.continent.iter().enumerate() {
            amplitude[o] = a;
            sx[o] = (x + ox) / continent.scale * frequency;
            sy[o] = (y - oy) / continent.scale * frequency;
            a *= CONTINENT_PERSISTENCE;
            frequency *= CONTINENT_LACUNARITY;
        }
        let mut sum = 0.0;
        for o in (0..CONTINENT_OCTAVES).step_by(2) {
            let pair = simplex.noise2(F64x2::new(sx[o], sx[o + 1]), F64x2::new(sy[o], sy[o + 1]));
            sum += pair[0] * amplitude[o];
            sum += pair[1] * amplitude[o + 1];
        }
        (sum / CONTINENT_MAX_AMPLITUDE + 1.0) * 0.5
    }

    /// The climate values at (x, y), evaluated in full: two warp octaves, one
    /// per sampled axis, and four for the continent.
    pub(crate) fn exact(&self, climate: &ClimateConfig, simplex: &Simplex, x: f64, y: f64) -> ClimateSample {
        let sample_t = !climate.temperature.cuts.is_empty();
        let sample_m = !climate.moisture.cuts.is_empty();

        // One warp vector shared by both axes; the constant shifts decorrelate
        // its two components.
        let (mut sx, mut sy) = (x, y);
        if sample_t || sample_m {
            let wx = (x + self.warp.0) / WARP_SAMPLE_SCALE;
            let wy = (y - self.warp.1) / WARP_SAMPLE_SCALE;
            let warp = simplex.noise2(F64x2::new(wx, wx + 137.13), F64x2::new(wy, wy - 91.7));
            sx = x + warp[0] * WARP_AMPLITUDE;
            sy = y + warp[1] * WARP_AMPLITUDE;
        }

        let axis_value = |sampled: bool, axis: &ClimateAxis, (ox, oy): (f64, f64)| {
            if !sampled {
                return 0.0;
            }
            (simplex.noise((sx + ox) / axis.scale, (sy - oy) / axis.scale) + 1.0) * 0.5
        };

        ClimateSample {
            temperature: axis_value(sample_t, &climate.temperature, self.temperature),
            moisture: axis_value(sample_m, &climate.moisture, self.moisture),
            continent: self.continent(climate, simplex, x, y),
        }
    }

    /// The climate values at (x, y), interpolated from the grid nodes around
    /// it. Equal to what a `ClimateGrid` holding those nodes returns.
    pub fn sample(&self, climate: &ClimateConfig, simplex: &Simplex, x: f64, y: f64) -> ClimateSample {
        let (gx, fx) = grid_cell(x);
        let (gy, fy) = grid_cell(y);
        let node = |i: i64, j: i64| self.exact(climate, simplex, node_position(i), node_position(j));
        ClimateSample::bilinear(
            &node(gx, gy),
            &node(gx + 1, gy),
            &node(gx, gy + 1),
            &node(gx + 1, gy + 1),
            fx,
            fy,
        )
    }

    /// The nodes covering samples `x0..x0 + width` × `y0..y0 + height`.
    pub fn grid(&self, climate: &ClimateConfig, simplex: &Simplex, x0: f64, y0: f64, width: usize, height: usize) -> ClimateGrid {
        let (gx0, _) = grid_cell(x0);
        let (gy0, _) = grid_cell(y0);
        let columns = (grid_cell(x0 + (width - 1) as f64).0 - gx0 + 2) as usize;
        let rows = (grid_cell(y0 + (height - 1) as f64).0 - gy0 + 2) as usize;
        let mut nodes = Vec::with_capacity(columns * rows);
        for j in 0..rows as i64 {
            for i in 0..columns as i64 {
                nodes.push(self.exact(climate, simplex, node_position(gx0 + i), node_position(gy0 + j)));
            }
        }
        ClimateGrid { gx0, gy0, columns, nodes }
    }
}

/// Samples between climate grid nodes. Climate fields are hundreds of samples
/// across at their finest, so interpolating over this loses nothing visible
/// and saves most of their evaluations.
const GRID_SPACING: f64 = 8.0;

fn node_position(index: i64) -> f64 {
    index as f64 * GRID_SPACING
}

/// The grid cell holding `x`, and how far across it `x` lies.
fn grid_cell(x: f64) -> (i64, f64) {
    let scaled = x / GRID_SPACING;
    let cell = scaled.floor();
    (cell as i64, scaled - cell)
}

/// The raw climate values at one point, before they resolve into biomes.
#[derive(Clone, Copy, Default)]
pub struct ClimateSample {
    /// Warped temperature, 0..1. 0 when the axis has no cuts.
    pub temperature: f64,
    /// Warped moisture, 0..1, before coastal moisture. 0 when the axis has no
    /// cuts.
    pub moisture: f64,
    /// The continent field. 1 with no continent.
    pub continent: f64,
}

impl ClimateSample {
    fn bilinear(a: &Self, b: &Self, c: &Self, d: &Self, fx: f64, fy: f64) -> Self {
        let mix = |a: f64, b: f64, c: f64, d: f64| {
            let top = a + (b - a) * fx;
            let bottom = c + (d - c) * fx;
            top + (bottom - top) * fy
        };
        Self {
            temperature: mix(a.temperature, b.temperature, c.temperature, d.temperature),
            moisture: mix(a.moisture, b.moisture, c.moisture, d.moisture),
            continent: mix(a.continent, b.continent, c.continent, d.continent),
        }
    }
}

/// Climate grid nodes over one field, built once before its sample loop.
pub struct ClimateGrid {
    gx0: i64,
    gy0: i64,
    columns: usize,
    nodes: Vec<ClimateSample>,
}

impl ClimateGrid {
    /// The climate values at (x, y), which must lie inside the grid.
    pub fn at(&self, x: f64, y: f64) -> ClimateSample {
        let (gx, fx) = grid_cell(x);
        let (gy, fy) = grid_cell(y);
        let i = (gx - self.gx0) as usize + (gy - self.gy0) as usize * self.columns;
        ClimateSample::bilinear(
            &self.nodes[i],
            &self.nodes[i + 1],
            &self.nodes[i + self.columns],
            &self.nodes[i + self.columns + 1],
            fx,
            fy,
        )
    }
}

/// The climate biomes for `values`, bilinear over up to four climate cells.
pub fn resolve_biomes(climate: &ClimateConfig, values: &ClimateSample) -> BiomeBlend {
    let t = if climate.temperature.cuts.is_empty() {
        AxisBands::default()
    } else {
        resolve_axis(values.temperature, &climate.temperature)
    };
    let m = if climate.moisture.cuts.is_empty() {
        AxisBands::default()
    } else {
        let mut value = values.moisture;
        // Wetter near the ocean.
        if let Some(continent) = &climate.continent {
            if continent.coastal_moisture.is_some_and(|m| m != 0.0) {
                value += coastal_moisture_at(continent, values.continent);
            }
        }
        resolve_axis(value, &climate.moisture)
    };

    let cell = |tb: usize, mb: usize| climate.cells[tb][mb] as usize;
    let mut blend = BiomeBlend::default();
    blend.add(cell(t.a, m.a), (1.0 - t.weight) * (1.0 - m.weight));
    if m.b != m.a {
        blend.add(cell(t.a, m.b), (1.0 - t.weight) * m.weight);
    }
    if t.b != t.a {
        blend.add(cell(t.b, m.a), t.weight * (1.0 - m.weight));
        if m.b != m.a {
            blend.add(cell(t.b, m.b), t.weight * m.weight);
        }
    }
    blend
}
