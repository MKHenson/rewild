//! Terrain heights in world metres. A port of the height half of `Noise.ts`.
//!
//! A height is a pure function of world position except for thermal erosion,
//! which reads neighbours. A field runs erosion over a margin it generates and
//! throws away, wide enough that every kept sample saw a full neighbourhood, so
//! neighbouring chunks agree exactly where they meet.

use crate::climate::{
    continent_land_weight, continent_seabed_depth, resolve_biomes, BiomeBlend, ClimateField, ClimateGrid,
    ClimateSample,
};
use crate::config::{ClimateConfig, Deformation, Octaves};
use math::{fast_max, fast_min, smoothstep01, F64x2, ParkMiller, PowerCurve, Simplex};

/// Passes of thermal erosion a biome may ask for. Each pass widens the margin
/// every field generates.
pub const MAX_EROSION_ITERATIONS: f64 = 48.0;

/// Octaves one deformation may sum. Bounds the per-sample scratch.
pub const MAX_OCTAVES: usize = 16;

// How far a ridged octave lets the one below it through, at full strength.
const RIDGE_GAIN: f64 = 2.0;

// Magnitude a 2D simplex gradient typically reaches. Normalises the eroded
// kind's accumulated slope, so `erosion` means the same whatever the stack.
const GRAD_TYPICAL: f64 = 2.6;

// Narrowest a terrace riser may be, as a share of a bench either side of its
// middle. A riser of no width is a wall the mesh cannot carry.
const RISER_MIN: f64 = 0.02;

/// One octave of a noise stack.
struct Octave {
    offset: (f64, f64),
    frequency: f64,
    amplitude: f64,
}

/// Seeded constants for one deformation, built once per generator.
struct Prepared {
    /// The octaves of the noise-based kinds.
    octaves: Vec<Octave>,
    max_amplitude: f64,
    /// The eroded kind's slope normaliser; 0 for the other kinds.
    max_slope: f64,
    /// Dunes: the wind bearing and the meander field's offset.
    cos: f64,
    sin: f64,
    warp: (f64, f64),
    /// Ridged: the sharpness, when it is a whole number.
    whole_exponent: Option<i32>,
    /// The stack's `curveExp`, for the noise-based kinds.
    curve: Option<PowerCurve>,
}

fn max_amplitude(persistence: f64, octaves: usize) -> f64 {
    if persistence == 1.0 {
        return octaves as f64;
    }
    (1.0 - persistence.powi(octaves as i32)) / (1.0 - persistence)
}

fn prepare_stack(stack: &Octaves, seed: f64, eroded: bool) -> Prepared {
    let mut rng = ParkMiller::new(seed + stack.seed_salt);
    let (mut amplitude, mut frequency) = (1.0, 1.0);
    let mut octaves = Vec::with_capacity(stack.count());
    for _ in 0..stack.count() {
        let x = rng.offset();
        octaves.push(Octave { offset: (x, rng.offset()), frequency, amplitude });
        amplitude *= stack.persistence;
        frequency *= stack.lacunarity;
    }

    // Sum of amplitude × frequency: each octave's share of the surface slope.
    let mut max_slope = 0.0;
    if eroded {
        let (mut amplitude, mut frequency) = (1.0, 1.0);
        for _ in 0..stack.count() {
            max_slope += amplitude * frequency;
            amplitude *= stack.persistence;
            frequency *= stack.lacunarity;
        }
        max_slope *= GRAD_TYPICAL;
    }

    Prepared {
        octaves,
        max_amplitude: max_amplitude(stack.persistence, stack.count()),
        max_slope,
        cos: 0.0,
        sin: 0.0,
        warp: (0.0, 0.0),
        whole_exponent: None,
        curve: Some(PowerCurve::new(stack.curve_exp)),
    }
}

fn prepare(def: &Deformation, seed: f64) -> Prepared {
    match def {
        Deformation::Fbm(stack) => prepare_stack(stack, seed, false),
        Deformation::Ridged(d) => {
            let whole = d.sharpness.fract() == 0.0 && d.sharpness.abs() <= 64.0;
            Prepared {
                whole_exponent: whole.then_some(d.sharpness as i32),
                ..prepare_stack(&d.stack, seed, false)
            }
        }
        Deformation::Terrace(d) => prepare_stack(&d.stack, seed, false),
        Deformation::Eroded(d) => prepare_stack(&d.stack, seed, true),
        Deformation::Dunes(d) => {
            let mut rng = ParkMiller::new(seed + d.seed_salt);
            let rad = d.angle_deg.to_radians();
            let x = rng.offset();
            Prepared {
                octaves: Vec::new(),
                max_amplitude: 1.0,
                max_slope: 0.0,
                cos: rad.cos(),
                sin: rad.sin(),
                warp: (x, rng.offset()),
                whole_exponent: None,
                curve: None,
            }
        }
    }
}

/// An octave's noise position for world sample (x, y).
#[inline(always)]
fn octave_at(stack: &Octaves, octave: &Octave, x: f64, y: f64) -> (f64, f64) {
    (
        (x + octave.offset.0) / stack.noise_scale * octave.frequency,
        (y - octave.offset.1) / stack.noise_scale * octave.frequency,
    )
}

/// The noise positions of octaves `o` and `o + 1`, as lanes.
#[inline(always)]
fn octave_pair(stack: &Octaves, prep: &Prepared, o: usize, x: f64, y: f64) -> (F64x2, F64x2) {
    let (ax, ay) = octave_at(stack, &prep.octaves[o], x, y);
    let (bx, by) = octave_at(stack, &prep.octaves[o + 1], x, y);
    (F64x2::new(ax, bx), F64x2::new(ay, by))
}

/// Every octave's noise at (x, y), into `values`. The octaves are independent,
/// so they run two to a SIMD call.
fn octave_noise(simplex: &Simplex, stack: &Octaves, prep: &Prepared, x: f64, y: f64, values: &mut [f64; MAX_OCTAVES]) {
    let count = prep.octaves.len();
    let mut o = 0;
    while o + 1 < count {
        let (sx, sy) = octave_pair(stack, prep, o, x, y);
        values[o..o + 2].copy_from_slice(&simplex.noise2(sx, sy));
        o += 2;
    }
    if o < count {
        let (sx, sy) = octave_at(stack, &prep.octaves[o], x, y);
        values[o] = simplex.noise(sx, sy);
    }
}

/// The stack's curve at a 0..1 noise value.
#[inline(always)]
fn curved(prep: &Prepared, n: f64) -> f64 {
    prep.curve.as_ref().map_or(n, |curve| curve.at(n))
}

/// A 0..1 noise value raised to the stack's curve, in metres.
#[inline(always)]
fn shaped(stack: &Octaves, prep: &Prepared, n: f64) -> f64 {
    curved(prep, n) * stack.amplitude
}

/// The plain octave sum at (x, y), mapped to 0..1.
fn fbm01(simplex: &Simplex, stack: &Octaves, prep: &Prepared, x: f64, y: f64) -> f64 {
    let mut values = [0.0; MAX_OCTAVES];
    octave_noise(simplex, stack, prep, x, y, &mut values);
    let mut sum = 0.0;
    for (octave, value) in prep.octaves.iter().zip(values) {
        sum += value * octave.amplitude;
    }
    (sum / prep.max_amplitude + 1.0) * 0.5
}

/// One deformation's height in metres at world sample (x, y).
fn deformation_height(simplex: &Simplex, def: &Deformation, prep: &Prepared, x: f64, y: f64) -> f64 {
    match def {
        Deformation::Fbm(stack) => shaped(stack, prep, fbm01(simplex, stack, prep, x, y)),

        Deformation::Ridged(d) => {
            let stack = &d.stack;
            let mut values = [0.0; MAX_OCTAVES];
            octave_noise(simplex, stack, prep, x, y, &mut values);
            let mut sum = 0.0;
            // The octave above decides how much of the one below survives, so
            // detail gathers on the ridges and the flanks stay smooth.
            let mut weight = 1.0;
            for (octave, value) in prep.octaves.iter().zip(values) {
                let crease = 1.0 - value.abs();
                // `powf` is a libm call in WASM; a whole sharpness is a few
                // multiplies.
                let r = match prep.whole_exponent {
                    Some(n) => crease.powi(n),
                    None => crease.powf(d.sharpness),
                } * weight;
                weight = fast_min(r * RIDGE_GAIN, 1.0);
                sum += r * octave.amplitude;
            }
            shaped(stack, prep, sum / prep.max_amplitude)
        }

        Deformation::Terrace(d) => {
            let stack = &d.stack;
            let n = curved(prep, fbm01(simplex, stack, prep, x, y));
            // Benches, flat across most of their width, with the climb squeezed
            // into a riser that narrows as sharpness rises.
            let t = n * d.steps;
            let bench = t.floor();
            let half = fast_max((1.0 - d.sharpness) * 0.5, RISER_MIN);
            let climbed = smoothstep01((t - bench - (0.5 - half)) / (2.0 * half));
            (bench + climbed) / d.steps * stack.amplitude
        }

        Deformation::Eroded(d) => {
            let stack = &d.stack;
            // Each octave's noise and gradient are independent of the others;
            // only the damping below chains them.
            let mut values = [(0.0, 0.0, 0.0); MAX_OCTAVES];
            let count = prep.octaves.len();
            let mut o = 0;
            while o + 1 < count {
                let (sx, sy) = octave_pair(stack, prep, o, x, y);
                let (n, gx, gy) = simplex.noise_with_gradient2(sx, sy);
                values[o] = (n[0], gx[0], gy[0]);
                values[o + 1] = (n[1], gx[1], gy[1]);
                o += 2;
            }
            if o < count {
                let (sx, sy) = octave_at(stack, &prep.octaves[o], x, y);
                values[o] = simplex.noise_with_gradient(sx, sy);
            }

            let mut sum = 0.0;
            // Gradient of the sum so far. Steep ground keeps less of each
            // octave that falls on it.
            let (mut dx, mut dy) = (0.0, 0.0);
            for (octave, (value, gx, gy)) in prep.octaves.iter().zip(values) {
                let (amplitude, frequency) = (octave.amplitude, octave.frequency);
                let slope_x = dx / prep.max_slope;
                let slope_y = dy / prep.max_slope;
                let damp = 1.0 / (1.0 + d.erosion * (slope_x * slope_x + slope_y * slope_y));
                sum += value * amplitude * damp;
                dx += gx * amplitude * frequency * damp;
                dy += gy * amplitude * frequency * damp;
            }
            shaped(stack, prep, (sum / prep.max_amplitude + 1.0) * 0.5)
        }

        Deformation::Dunes(d) => {
            // Crest lines run across the wind at about one wavelength apart,
            // meandered by a low-frequency field.
            let meander = simplex.noise((x + prep.warp.0) / d.warp_scale, (y + prep.warp.1) / d.warp_scale);
            let phase = (x * prep.cos + y * prep.sin) / d.wavelength + d.warp * meander;
            // A skewed period: gentle windward rise to a crest at `p`, then a
            // steeper lee. Sharpness pushes the crest leeward.
            let u = phase - phase.floor();
            let p = 0.5 + 0.45 * d.sharpness;
            let tri = if u < p { u / p } else { (1.0 - u) / (1.0 - p) };
            d.amplitude * tri * tri * (3.0 - 2.0 * tri)
        }
    }
}

/// The biome weights and land share behind one height sample.
#[derive(Clone, Copy, Default)]
pub struct HeightSample {
    pub height: f64,
    pub blend: BiomeBlend,
    pub land: f64,
    /// The continent field. 1 with no continent.
    pub continent: f64,
}

/// Heights for one world: a climate preset, a seed and a sea level.
pub struct HeightGenerator {
    climate: ClimateConfig,
    simplex: Simplex,
    field: ClimateField,
    prepared: Vec<Vec<Prepared>>,
    seed: f64,
    sea_level: f64,
    meters_per_sample: f64,
    /// Erosion passes: the most any biome asks for.
    passes: usize,
}

impl HeightGenerator {
    pub fn new(
        climate: ClimateConfig,
        seed: f64,
        sea_level: f64,
        meters_per_sample: f64,
    ) -> Result<Self, String> {
        validate(&climate)?;
        let prepared = climate
            .biomes
            .iter()
            .map(|biome| biome.deformations.iter().map(|def| prepare(def, seed)).collect())
            .collect();
        let passes = climate
            .biomes
            .iter()
            .filter_map(|b| b.erosion.as_ref())
            .filter(|e| e.strength > 0.0)
            .map(|e| e.iterations.ceil() as usize)
            .max()
            .unwrap_or(0);
        Ok(Self {
            field: ClimateField::new(seed, &climate),
            simplex: Simplex::new(seed),
            climate,
            prepared,
            seed,
            sea_level,
            meters_per_sample,
            passes,
        })
    }

    pub fn climate(&self) -> &ClimateConfig {
        &self.climate
    }

    pub fn seed(&self) -> f64 {
        self.seed
    }

    pub fn sea_level(&self) -> f64 {
        self.sea_level
    }

    pub fn meters_per_sample(&self) -> f64 {
        self.meters_per_sample
    }

    /// The continent field at world sample (x, y), in 0..1. Below the
    /// preset's `coast` is ocean.
    pub fn continent(&self, x: f64, y: f64) -> f64 {
        self.field.sample(&self.climate, &self.simplex, x, y).continent
    }

    /// The climate grid covering world samples `x0..=x0 + width - 1` ×
    /// `y0..=y0 + height - 1`, the grid the heights read.
    pub fn climate_grid(&self, x0: f64, y0: f64, width: usize, height: usize) -> ClimateGrid {
        self.field.grid(&self.climate, &self.simplex, x0, y0, width, height)
    }

    /// The un-eroded, uncarved height at world sample (x, y): the biomes'
    /// heights blended, then lowered onto the sea bed by the continent.
    pub fn sample(&self, x: f64, y: f64) -> HeightSample {
        let values = self.field.sample(&self.climate, &self.simplex, x, y);
        self.sample_with(x, y, &values)
    }

    fn sample_with(&self, x: f64, y: f64, values: &ClimateSample) -> HeightSample {
        let blend = resolve_biomes(&self.climate, values);

        let (mut land, mut seabed) = (1.0, 0.0);
        if let Some(continent) = &self.climate.continent {
            land = continent_land_weight(continent, values.continent);
            seabed = self.sea_level - continent_seabed_depth(continent, values.continent);
        }

        let mut h = 0.0;
        if land > 0.0 {
            for i in 0..blend.count {
                let biome = blend.biomes[i];
                let mut biome_height = 0.0;
                for (def, prep) in self.climate.biomes[biome].deformations.iter().zip(&self.prepared[biome]) {
                    biome_height += deformation_height(&self.simplex, def, prep, x, y);
                }
                h += blend.weights[i] * biome_height;
            }
        }
        HeightSample { height: seabed + land * (h - seabed), blend, land, continent: values.continent }
    }

    /// A `width` × `height` field of heights centred on chunk offset
    /// (`offset_x`, `offset_y`), row-major, before lakes are carved.
    ///
    /// Sample (i, j) sits at world sample (i - width / 2 + offset_x,
    /// j - height / 2 - offset_y), the convention of every TS terrain field.
    pub fn generate(&self, width: usize, height: usize, offset_x: f64, offset_y: f64) -> Vec<f32> {
        // A pass moves a cell by its neighbours' moves, and each of those is
        // shared over the neighbour's own neighbours, so one pass reads two
        // samples out. The edge, which never moves, spoils two rings a pass.
        let margin = self.passes * 2;
        let field_width = width + margin * 2;
        let field_height = height + margin * 2;
        let x0 = offset_x - field_width as f64 / 2.0;
        let y0 = -offset_y - field_height as f64 / 2.0;

        let cells = field_width * field_height;
        let mut heights = vec![0.0f32; cells];
        let mut talus = vec![0.0f32; if margin > 0 { cells } else { 0 }];
        let mut strength = vec![0.0f32; talus.len()];
        let grid = self.field.grid(&self.climate, &self.simplex, x0, y0, field_width, field_height);

        for j in 0..field_height {
            let y = y0 + j as f64;
            for i in 0..field_width {
                let cell = i + j * field_width;
                let x = x0 + i as f64;
                let s = self.sample_with(x, y, &grid.at(x, y));
                heights[cell] = s.height as f32;
                if margin > 0 {
                    let (t, st) = self.weathering(&s);
                    talus[cell] = t;
                    strength[cell] = st;
                }
            }
        }

        if margin == 0 {
            return heights;
        }
        erode_thermal(&mut heights, field_width, field_height, self.passes, &talus, &strength);

        let mut out = Vec::with_capacity(width * height);
        for j in 0..height {
            let start = (j + margin) * field_width + margin;
            out.extend_from_slice(&heights[start..start + width]);
        }
        out
    }

    /// Talus height and erosion strength at one sample, from the weathered
    /// biomes it blends. The repose angle is averaged over those biomes only,
    /// or a cell half in an unweathered biome would never slide.
    fn weathering(&self, s: &HeightSample) -> (f32, f32) {
        let (mut talus, mut strength, mut weight) = (0.0, 0.0, 0.0);
        if s.land > 0.0 {
            for i in 0..s.blend.count {
                let Some(e) = &self.climate.biomes[s.blend.biomes[i]].erosion else {
                    continue;
                };
                let w = s.blend.weights[i];
                talus += w * e.talus_deg.to_radians().tan() * self.meters_per_sample;
                strength += w * e.strength;
                weight += w;
            }
        }
        let talus = if weight > 0.0 { talus / weight } else { 0.0 };
        (talus as f32, strength as f32)
    }
}

/// Thermal erosion in place: material above the angle of repose slides to the
/// lower of its four neighbours. Moves gather into `delta` and apply at the
/// end of each pass, so no cell's move depends on loop order.
fn erode_thermal(heights: &mut [f32], width: usize, height: usize, passes: usize, talus: &[f32], strength: &[f32]) {
    let mut delta = vec![0.0f32; heights.len()];
    for _ in 0..passes {
        delta.fill(0.0);
        for y in 1..height - 1 {
            for x in 1..width - 1 {
                let c = x + y * width;
                let s = strength[c];
                if s <= 0.0 {
                    continue;
                }
                let h = heights[c];
                let threshold = talus[c];
                let excess = [
                    h - heights[c - 1] - threshold,
                    h - heights[c + 1] - threshold,
                    h - heights[c - width] - threshold,
                    h - heights[c + width] - threshold,
                ];

                let mut total = 0.0;
                let mut steepest = 0.0f32;
                for &e in &excess {
                    if e > 0.0 {
                        total += e;
                        if e > steepest {
                            steepest = e;
                        }
                    }
                }
                if total <= 0.0 {
                    continue;
                }

                // Budgeted on the steepest neighbour and halved, so two cells
                // never trade the same material back and forth.
                let moved = s * 0.5 * steepest;
                let share = moved / total;
                let neighbours = [c - 1, c + 1, c - width, c + width];
                for (&n, &e) in neighbours.iter().zip(&excess) {
                    if e > 0.0 {
                        delta[n] += e * share;
                    }
                }
                delta[c] -= moved;
            }
        }
        for (h, d) in heights.iter_mut().zip(&delta) {
            *h += d;
        }
    }
}

fn validate(climate: &ClimateConfig) -> Result<(), String> {
    for biome in &climate.biomes {
        let name = &biome.name;
        if biome.deformations.is_empty() {
            return Err(format!("Biome '{name}' must have at least one deformation."));
        }
        for def in &biome.deformations {
            let (kind, stack) = match def {
                Deformation::Fbm(s) => ("fbm", Some(s)),
                Deformation::Ridged(d) => ("ridged", Some(&d.stack)),
                Deformation::Terrace(d) => ("terrace", Some(&d.stack)),
                Deformation::Eroded(d) => ("eroded", Some(&d.stack)),
                Deformation::Dunes(_) => ("dunes", None),
            };
            if stack.is_some_and(|s| s.noise_scale <= 0.0) {
                return Err(format!(
                    "Biome '{name}' {kind} deformation noiseScale must be a positive number."
                ));
            }
            if stack.is_some_and(|s| s.count() > MAX_OCTAVES) {
                return Err(format!(
                    "Biome '{name}' {kind} deformation may have at most {MAX_OCTAVES} octaves."
                ));
            }
            match def {
                Deformation::Ridged(d) if d.sharpness <= 0.0 => {
                    return Err(format!(
                        "Biome '{name}' ridged deformation sharpness must be a positive number."
                    ))
                }
                Deformation::Terrace(d) if d.steps < 1.0 => {
                    return Err(format!("Biome '{name}' terrace deformation needs at least one step."))
                }
                Deformation::Eroded(d) if d.erosion < 0.0 => {
                    return Err(format!(
                        "Biome '{name}' eroded deformation erosion must not be negative."
                    ))
                }
                Deformation::Dunes(d) if d.wavelength <= 0.0 || d.warp_scale <= 0.0 => {
                    return Err(format!(
                        "Biome '{name}' dune deformation wavelength and warpScale must be positive numbers."
                    ))
                }
                _ => {}
            }
        }

        if let Some(e) = &biome.erosion {
            if e.iterations < 0.0 || e.iterations > MAX_EROSION_ITERATIONS {
                return Err(format!(
                    "Biome '{name}' erosion iterations must be 0..{MAX_EROSION_ITERATIONS}. \
                     Every pass widens the margin the height map generates for itself."
                ));
            }
            if e.talus_deg <= 0.0 || e.talus_deg >= 90.0 {
                return Err(format!("Biome '{name}' erosion talusDeg must be between 0 and 90."));
            }
            if e.strength <= 0.0 || e.strength > 1.0 {
                return Err(format!(
                    "Biome '{name}' erosion strength must be above 0 and at most 1."
                ));
            }
        }
    }

    if let Some(c) = &climate.continent {
        if c.scale <= 0.0 {
            return Err("Continent scale must be a positive number.".into());
        }
        if c.blend_half_width <= 0.0 || c.shelf_width <= 0.0 || c.slope_width <= 0.0 {
            return Err("Continent blend, shelf and slope widths must be positive numbers.".into());
        }
        if c.shelf_depth < 0.0 || c.ocean_depth < c.shelf_depth {
            return Err("Continent depths must satisfy 0 <= shelfDepth <= oceanDepth.".into());
        }
        if c.coastal_moisture.is_some_and(|m| m != 0.0)
            && !(c.coastal_moisture_reach.unwrap_or(0.0) > 0.0)
        {
            return Err("Continent coastalMoisture needs a positive coastalMoistureReach.".into());
        }
    }

    let t_bands = climate.temperature.cuts.len() + 1;
    let m_bands = climate.moisture.cuts.len() + 1;
    if climate.cells.len() != t_bands {
        return Err(format!("Climate cells must have {t_bands} temperature rows."));
    }
    for row in &climate.cells {
        if row.len() != m_bands {
            return Err(format!("Climate cell rows must have {m_bands} moisture entries."));
        }
        for &biome in row {
            if biome < 0 || biome as usize >= climate.biomes.len() {
                return Err(format!("Climate cell biome index {biome} is out of range."));
            }
        }
    }
    Ok(())
}
