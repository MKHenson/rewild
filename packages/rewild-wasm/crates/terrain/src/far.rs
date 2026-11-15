//! What the horizon ring draws past the last chunk, sampled far coarser than
//! any chunk. A port of `FarMapBuilder.ts`.
//!
//! Per texel: the ground height and the raw continent value, as f16, and the
//! weight of each palette material. The height is the generator's before
//! erosion and lake carving, which only shape detail far finer than a texel.
//! The weights follow the splat's rules, read off the slope across a texel.
//!
//! A map built with sprite layers also places their instances over it, by the
//! scatter's rules on its climate, height and slope.

use crate::climate::ClimateSample;
use crate::grid::{nearest_index, sample_bilinear, slope_at};
use crate::lakes::{lake_to_world, world_to_lake};
use crate::scatter::{FarSample, LakeRect};
use crate::splat::{SplatGenerator, MAX_SPLAT_LAYERS};
use crate::water::to_f16;
use crate::{HeightGenerator, ScatterGenerator};

/// A square of `texels`² texels, each `step` metres across, from world
/// (`left`, `bottom`). Texel (i, j) covers +x with i and +z with j.
#[derive(Clone, Copy)]
struct TexelGrid {
    left: f64,
    bottom: f64,
    step: f64,
    texels: usize,
}

impl TexelGrid {
    fn new(centre_x: f64, centre_z: f64, span: f64, texels: usize) -> Self {
        Self { left: centre_x - span / 2.0, bottom: centre_z - span / 2.0, step: span / texels as f64, texels }
    }

    fn span(&self) -> f64 {
        self.step * self.texels as f64
    }

    fn index(&self, i: usize, j: usize) -> usize {
        i + j * self.texels
    }

    /// World (x, z) of texel (i, j)'s centre.
    fn centre(&self, i: usize, j: usize) -> (f64, f64) {
        (self.left + (i as f64 + 0.5) * self.step, self.bottom + (j as f64 + 0.5) * self.step)
    }

    /// Texel coordinates of world (`x`, `z`), fractional between texel
    /// centres and clamped onto the outermost ones.
    fn texel_at(&self, x: f64, z: f64) -> (f64, f64) {
        let last = (self.texels - 1) as f64;
        let to_texel = |metres: f64| (metres / self.step - 0.5).clamp(0.0, last);
        (to_texel(x - self.left), to_texel(z - self.bottom))
    }

    /// Row `j`'s band of the map in lake space, which runs v down world z.
    fn row_in_lake_space(&self, j: usize, meters_per_sample: f64) -> LakeRect {
        let z0 = self.bottom + j as f64 * self.step;
        let (u0, v1) = world_to_lake(self.left, z0, meters_per_sample);
        let (u1, v0) = world_to_lake(self.left + self.span(), z0 + self.step, meters_per_sample);
        LakeRect { u0, v0, u1, v1 }
    }
}

/// What the ground pass sampled at each texel, for the passes after it.
struct TexelSamples {
    heights: Vec<f32>,
    slopes: Vec<f32>,
    climate: Vec<ClimateSample>,
}

impl TexelSamples {
    /// The ground at world (`x`, `z`): height bilinear between texels, climate
    /// and slope from the nearest.
    fn ground_at(&self, grid: &TexelGrid, x: f64, z: f64) -> FarSample {
        let n = grid.texels;
        let (fx, fz) = grid.texel_at(x, z);
        let t = grid.index(nearest_index(fx, n), nearest_index(fz, n));
        FarSample { climate: self.climate[t], height: sample_bilinear(&self.heights, n, fx, fz), slope: self.slopes[t] as f64 }
    }
}

/// One sprite layer's instances over the map.
pub struct SpriteLayer {
    pub slot: usize,
    /// FAR_SPRITE_STRIDE floats each, as `ScatterGenerator::place_far_sprites`
    /// gives them.
    pub instances: Vec<f32>,
}

/// Which pass a build row belongs to, and the texel row it covers.
enum Pass {
    Ground(usize),
    Weights(usize),
    Sprites(usize),
}

/// A far map built a few rows at a time, so a rebuild can be spread over
/// frames: every row's ground first, then every row's weights, which need the
/// slope across the rows either side, then every row's sprites.
pub struct FarMap {
    grid: TexelGrid,
    next_row: usize,
    samples: TexelSamples,
    /// rg16float bits per texel: height in metres, then the continent value.
    pub ground: Vec<u16>,
    /// Palette weights as two RGBA8 planes, laid out like a splat map.
    pub weights: Vec<u8>,
    /// The sprite layers asked for, in the order given.
    pub sprites: Vec<SpriteLayer>,
}

impl FarMap {
    /// A map of `texels`² over `span` metres centred on world (`centre_x`,
    /// `centre_z`), placing the instances of the scatter layers in
    /// `sprite_slots` over it.
    pub fn new(centre_x: f64, centre_z: f64, span: f64, texels: usize, sprite_slots: &[usize]) -> Self {
        let count = texels * texels;
        Self {
            grid: TexelGrid::new(centre_x, centre_z, span, texels),
            next_row: 0,
            samples: TexelSamples {
                heights: vec![0.0; count],
                slopes: vec![0.0; count],
                climate: vec![ClimateSample::default(); count],
            },
            ground: vec![0; count * 2],
            weights: vec![0; count * MAX_SPLAT_LAYERS],
            sprites: sprite_slots.iter().map(|&slot| SpriteLayer { slot, instances: Vec::new() }).collect(),
        }
    }

    fn total_rows(&self) -> usize {
        let passes = if self.sprites.is_empty() { 2 } else { 3 };
        self.grid.texels * passes
    }

    fn pass(&self, row: usize) -> Pass {
        let n = self.grid.texels;
        match row / n {
            0 => Pass::Ground(row),
            1 => Pass::Weights(row - n),
            _ => Pass::Sprites(row - 2 * n),
        }
    }

    pub fn done(&self) -> bool {
        self.next_row >= self.total_rows()
    }

    /// Builds up to `rows` more rows; returns whether the map is complete.
    pub fn build(&mut self, ground: &HeightGenerator, splat: &SplatGenerator, scatter: &ScatterGenerator, rows: usize) -> bool {
        let end = self.total_rows().min(self.next_row.saturating_add(rows));
        let mut layer_weights = vec![0.0; splat.max_layers()];
        let meters_per_sample = ground.meters_per_sample();
        while self.next_row < end {
            match self.pass(self.next_row) {
                Pass::Ground(j) => self.sample_ground_row(ground, j),
                Pass::Weights(j) => self.write_weights_row(splat, j, &mut layer_weights),
                Pass::Sprites(j) => self.place_sprite_row(scatter, j, meters_per_sample),
            }
            self.next_row += 1;
        }
        self.done()
    }

    fn sample_ground_row(&mut self, ground: &HeightGenerator, j: usize) {
        let grid = self.grid;
        for i in 0..grid.texels {
            let (x, z) = grid.centre(i, j);
            let (u, v) = world_to_lake(x, z, ground.meters_per_sample());
            let (sample, climate) = ground.sample_exact(u, v);
            let t = grid.index(i, j);
            self.samples.heights[t] = sample.height as f32;
            self.samples.climate[t] = climate;
            self.ground[t * 2] = to_f16(sample.height);
            self.ground[t * 2 + 1] = to_f16(climate.continent);
        }
    }

    fn write_weights_row(&mut self, splat: &SplatGenerator, j: usize, layer_weights: &mut [f64]) {
        let grid = self.grid;
        let n = grid.texels;
        let second_plane = n * n * 4;
        for i in 0..n {
            let t = grid.index(i, j);
            let slope = slope_at(&self.samples.heights, n, n, i, j, grid.step);
            self.samples.slopes[t] = slope as f32;
            let height = self.samples.heights[t] as f64;
            let channels = splat.far_texel(&self.samples.climate[t], height, slope, layer_weights);
            for c in 0..4 {
                self.weights[t * 4 + c] = (channels[c] * 255.0).round() as u8;
                self.weights[second_plane + t * 4 + c] = (channels[c + 4] * 255.0).round() as u8;
            }
        }
    }

    /// The sprites whose candidates land in texel row `j`'s band of the map.
    fn place_sprite_row(&mut self, scatter: &ScatterGenerator, j: usize, meters_per_sample: f64) {
        let grid = self.grid;
        let samples = &self.samples;
        let area = grid.row_in_lake_space(j, meters_per_sample);
        let ground_at = |u: f64, v: f64| {
            let (x, z) = lake_to_world(u, v, meters_per_sample);
            samples.ground_at(&grid, x, z)
        };
        for layer in &mut self.sprites {
            scatter.place_far_sprites(layer.slot, area, ground_at, &mut layer.instances);
        }
    }
}
