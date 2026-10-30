//! What the horizon ring draws past the last chunk, sampled far coarser than
//! any chunk. A port of `FarMapBuilder` in `HorizonCoverage.ts`.
//!
//! Per texel: the ground height and the raw continent value, as f16, and the
//! weight of each palette material. The height is the generator's before
//! erosion and lake carving, which only shape detail far finer than a texel.
//! The weights follow the splat's rules, read off the slope across a texel.

use crate::climate::ClimateSample;
use crate::splat::{SplatGenerator, MAX_SPLAT_LAYERS};
use crate::water::to_f16;
use crate::HeightGenerator;

/// A far map built a few rows at a time, so a rebuild can be spread over
/// frames: every row's ground first, then every row's weights, which need the
/// slope across the rows either side.
pub struct FarMap {
    centre: (f64, f64),
    span: f64,
    texels: usize,
    row: usize,
    heights: Vec<f32>,
    climate: Vec<ClimateSample>,
    /// rg16float bits per texel: height in metres, then the continent value.
    pub ground: Vec<u16>,
    /// Palette weights as two RGBA8 planes, laid out like a splat map.
    pub weights: Vec<u8>,
}

impl FarMap {
    /// A map of `texels`² over `span` metres centred on world (`centre_x`,
    /// `centre_z`). Texel (i, j) covers +x with i and +z with j.
    pub fn new(centre_x: f64, centre_z: f64, span: f64, texels: usize) -> Self {
        let count = texels * texels;
        Self {
            centre: (centre_x, centre_z),
            span,
            texels,
            row: 0,
            heights: vec![0.0; count],
            climate: vec![ClimateSample::default(); count],
            ground: vec![0; count * 2],
            weights: vec![0; count * MAX_SPLAT_LAYERS],
        }
    }

    pub fn done(&self) -> bool {
        self.row >= self.texels * 2
    }

    /// Builds up to `rows` more rows; returns whether the map is complete.
    pub fn build(&mut self, ground: &HeightGenerator, splat: &SplatGenerator, rows: usize) -> bool {
        let end = (self.texels * 2).min(self.row.saturating_add(rows));
        let mut scratch = vec![0.0; splat.max_layers()];
        while self.row < end {
            if self.row < self.texels {
                self.ground_row(ground, self.row);
            } else {
                self.weights_row(splat, self.row - self.texels, &mut scratch);
            }
            self.row += 1;
        }
        self.done()
    }

    /// World metres of texel column 0's centre and texel row `j`'s.
    fn origin(&self, j: usize) -> (f64, f64, f64) {
        let step = self.span / self.texels as f64;
        let x0 = self.centre.0 - self.span / 2.0 + step / 2.0;
        let z = self.centre.1 - self.span / 2.0 + step / 2.0 + j as f64 * step;
        (x0, z, step)
    }

    fn ground_row(&mut self, ground: &HeightGenerator, j: usize) {
        let (x0, z, step) = self.origin(j);
        let mps = ground.meters_per_sample();
        // Lake space of the sample nearest a world point.
        let v = -z / mps - 0.5;
        for i in 0..self.texels {
            let u = (x0 + i as f64 * step) / mps - 0.5;
            let t = i + j * self.texels;
            let (sample, values) = ground.sample_exact(u, v);
            let height = sample.height as f32;
            self.heights[t] = height;
            self.climate[t] = values;
            self.ground[t * 2] = to_f16(height as f64);
            self.ground[t * 2 + 1] = to_f16(values.continent);
        }
    }

    fn weights_row(&mut self, splat: &SplatGenerator, j: usize, scratch: &mut [f64]) {
        let (_, _, step) = self.origin(j);
        let n = self.texels;
        let plane = n * n * 4;
        let (j0, j1) = (j.saturating_sub(1), (j + 1).min(n - 1));
        for i in 0..n {
            let t = i + j * n;
            let (i0, i1) = (i.saturating_sub(1), (i + 1).min(n - 1));
            let at = |i: usize, j: usize| self.heights[i + j * n] as f64;
            let dx = (at(i1, j) - at(i0, j)) / ((i1 - i0) as f64 * step);
            let dz = (at(i, j1) - at(i, j0)) / ((j1 - j0) as f64 * step);
            let slope = (dx * dx + dz * dz).sqrt().atan().to_degrees();
            let channels = splat.far_texel(&self.climate[t], self.heights[t] as f64, slope, scratch);
            let base = t * 4;
            for c in 0..4 {
                self.weights[base + c] = (channels[c] * 255.0).round() as u8;
                self.weights[plane + base + c] = (channels[c + 4] * 255.0).round() as u8;
            }
        }
    }
}
