//! Author paint over a chunk, and the biomes it merges with the climate's. See
//! `PaintMask.ts`.

use crate::climate::{resolve_biomes, ClimateSample};
use crate::config::ClimateConfig;
use math::fast_max;

/// Painted weights over a chunk: channel-major planes of `size` × `size`
/// texels, one texel every `step` samples.
pub struct PaintMask<'a> {
    pub size: usize,
    pub step: f64,
    pub channels: usize,
    pub weights: &'a [u8],
}

impl PaintMask<'_> {
    /// The four texels around sample (x, y), clamped to the mask, and how far
    /// across them it lies.
    fn corners(&self, x: f64, y: f64) -> ([usize; 4], f64, f64) {
        let max = self.size - 1;
        let (fx, fy) = (x / self.step, y / self.step);
        let x0 = (fast_max(fx.floor(), 0.0) as usize).min(max);
        let y0 = (fast_max(fy.floor(), 0.0) as usize).min(max);
        let x1 = if x0 < max { x0 + 1 } else { x0 };
        let y1 = if y0 < max { y0 + 1 } else { y0 };
        let corners = [y0 * self.size + x0, y0 * self.size + x1, y1 * self.size + x0, y1 * self.size + x1];
        (corners, fx - x0 as f64, fy - y0 as f64)
    }

    fn bilinear(&self, channel: usize, corners: &[usize; 4], tx: f64, ty: f64) -> f64 {
        let plane = self.size * self.size;
        let w = |i: usize| self.weights[channel * plane + corners[i]] as f64;
        let top = w(0) + (w(1) - w(0)) * tx;
        let bottom = w(2) + (w(3) - w(2)) * tx;
        (top + (bottom - top) * ty) / 255.0
    }

    /// Every channel at sample (x, y) into `out`, bilinear, 0..1, for channels
    /// that share one budget. Returns the painted total, renormalised to at
    /// most 1.
    pub fn sample(&self, x: f64, y: f64, out: &mut [f64]) -> f64 {
        let (corners, tx, ty) = self.corners(x, y);
        let mut total = 0.0;
        for (c, value) in out.iter_mut().enumerate().take(self.channels) {
            *value = self.bilinear(c, &corners, tx, ty);
            total += *value;
        }
        // The brush keeps the channels within budget, but interpolation can
        // push the total a hair over; renormalise so the splat still sums to 1.
        if total > 1.0 {
            for value in out.iter_mut().take(self.channels) {
                *value /= total;
            }
            return 1.0;
        }
        total
    }

    /// One channel at sample (x, y), bilinear, 0..1, for channels that are
    /// independent quantities. 0 for a channel the mask lacks.
    pub fn sample_channel(&self, channel: usize, x: f64, y: f64) -> f64 {
        if channel >= self.channels {
            return 0.0;
        }
        let (corners, tx, ty) = self.corners(x, y);
        self.bilinear(channel, &corners, tx, ty)
    }

    /// True when `channel` holds no paint anywhere, or the mask lacks it.
    pub fn is_channel_empty(&self, channel: usize) -> bool {
        let plane = self.size * self.size;
        channel >= self.channels || self.weights[channel * plane..(channel + 1) * plane].iter().all(|&w| w == 0)
    }
}

/// The biomes active at a sample: painted biomes take their weight outright,
/// and the climate's scale into what is left. Scratch for one chunk.
pub struct ActiveBiomes {
    pub biomes: Vec<usize>,
    pub weights: Vec<f64>,
    pub count: usize,
    paint: Vec<f64>,
}

impl ActiveBiomes {
    pub fn new(climate: &ClimateConfig, mask: Option<&PaintMask>) -> Self {
        // Painted biomes merge with up to four climate biomes.
        let capacity = climate.biomes.len() + 4;
        Self {
            biomes: vec![0; capacity],
            weights: vec![0.0; capacity],
            count: 0,
            paint: vec![0.0; mask.map_or(0, |m| m.channels)],
        }
    }

    /// Resolves the biomes at chunk sample (x, y), whose climate values are
    /// `values`. Weights sum to 1.
    pub fn resolve(&mut self, climate: &ClimateConfig, values: &ClimateSample, mask: Option<&PaintMask>, x: f64, y: f64) {
        let mut count = 0;
        let mut painted = 0.0;
        if let Some(mask) = mask {
            painted = mask.sample(x, y, &mut self.paint);
            for (c, &w) in self.paint.iter().enumerate() {
                if w > 0.0 {
                    self.biomes[count] = c;
                    self.weights[count] = w;
                    count += 1;
                }
            }
        }
        let climate_share = 1.0 - painted;
        if climate_share > 0.0 {
            let blend = resolve_biomes(climate, values);
            for i in 0..blend.count {
                let (biome, w) = (blend.biomes[i], blend.weights[i] * climate_share);
                match self.biomes[..count].iter().position(|&b| b == biome) {
                    Some(j) => self.weights[j] += w,
                    None => {
                        self.biomes[count] = biome;
                        self.weights[count] = w;
                        count += 1;
                    }
                }
            }
        }
        self.count = count;
    }
}
