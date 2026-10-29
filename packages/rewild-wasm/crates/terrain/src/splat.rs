//! Splat maps: per texel, the weight of each palette material. A port of
//! `generateSplatMap` in `Splat.ts`.
//!
//! The climate (or the author's paint) decides which biome a texel is in; the
//! biome's layer rules, read off the chunk's actual heights, decide which of its
//! materials. Climate owes nothing to the heights, so a sculpted chunk resolves
//! the same way a generated one does.

use serde::Deserialize;

use crate::climate::{ocean_coverage, resolve_biomes, ClimateField};
use crate::config::{Band, ClimateConfig, Layer, Selector};
use math::{fast_max, smoothstep01, ParkMiller, Simplex};

/// Materials in one splat map: two RGBA8 planes.
pub const MAX_SPLAT_LAYERS: usize = 8;

/// The palette the splat channels index, decided by the TS side
/// (`getClimatePalette`, `getCoastMaterials`).
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SplatSpec {
    pub palette: Vec<String>,
    /// Dry sand, wet sand and sea bed; empty with no coast.
    pub coast_materials: Vec<String>,
}

/// Author-painted biome weights over a chunk: channel-major planes of
/// `size` × `size` texels, one texel every `step` samples. See `PaintMask.ts`.
pub struct PaintMask<'a> {
    pub size: usize,
    pub step: f64,
    pub channels: usize,
    pub weights: &'a [u8],
}

impl PaintMask<'_> {
    /// Every channel at sample (x, y) into `out`, bilinear, 0..1. Returns the
    /// painted total, renormalised to at most 1.
    fn sample(&self, x: f64, y: f64, out: &mut [f64]) -> f64 {
        let max = self.size - 1;
        let (fx, fy) = (x / self.step, y / self.step);
        let x0 = (fast_max(fx.floor(), 0.0) as usize).min(max);
        let y0 = (fast_max(fy.floor(), 0.0) as usize).min(max);
        let x1 = if x0 < max { x0 + 1 } else { x0 };
        let y1 = if y0 < max { y0 + 1 } else { y0 };
        let (tx, ty) = (fx - x0 as f64, fy - y0 as f64);

        let plane = self.size * self.size;
        let corners = [y0 * self.size + x0, y0 * self.size + x1, y1 * self.size + x0, y1 * self.size + x1];
        let mut total = 0.0;
        for (c, value) in out.iter_mut().enumerate().take(self.channels) {
            let w = |i: usize| self.weights[c * plane + corners[i]] as f64;
            let top = w(0) + (w(1) - w(0)) * tx;
            let bottom = w(2) + (w(3) - w(2)) * tx;
            *value = (top + (bottom - top) * ty) / 255.0;
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
}

/// An inclusive window of texels.
#[derive(Clone, Copy)]
pub struct Region {
    pub x0: usize,
    pub y0: usize,
    pub x1: usize,
    pub y1: usize,
}

fn band_coverage(band: &Band, value: f64) -> f64 {
    smoothstep01((value - band.from) / (band.to - band.from))
}

fn selector_coverage(selector: Option<&Selector>, value: f64) -> f64 {
    match selector {
        None => 1.0,
        Some(Selector::One(band)) => band_coverage(band, value),
        Some(Selector::All(bands)) => bands.iter().map(|b| band_coverage(b, value)).product(),
    }
}

fn layer_coverage(layer: &Layer, height: f64, slope: f64, noise: f64) -> f64 {
    selector_coverage(layer.slope.as_ref(), slope)
        * selector_coverage(layer.height.as_ref(), height)
        * layer.noise.as_ref().map_or(1.0, |n| band_coverage(&n.band, noise))
}

/// One biome's layer weights at a sample into `out[..layers.len()]`, summing to
/// 1. Base first, like painting: from the top down each layer takes its
/// coverage of what is still uncovered, and the base keeps the rest.
///
/// `noise(l)` is layer `l`'s noise field there, 0..1; it is only called for
/// layers with a noise selector.
pub fn layer_weights(layers: &[Layer], height: f64, slope: f64, noise: impl Fn(usize) -> f64, out: &mut [f64]) {
    let mut remaining = 1.0;
    for l in (1..layers.len()).rev() {
        let n = if layers[l].noise.is_some() { noise(l) } else { 0.0 };
        let covered = layer_coverage(&layers[l], height, slope, n) * remaining;
        out[l] = covered;
        remaining -= covered;
    }
    out[0] = remaining;
}

pub struct SplatGenerator {
    climate: ClimateConfig,
    simplex: Simplex,
    field: ClimateField,
    sea_level: f64,
    meters_per_sample: f64,
    /// Splat channel of each biome's each layer.
    channels: Vec<Vec<usize>>,
    /// Each biome's each layer's noise field offset, where it has a selector.
    layer_noise: Vec<Vec<Option<(f64, f64)>>>,
    /// Channels of the beach's dry sand, wet sand and sea bed.
    coast_channels: Option<[usize; 3]>,
}

impl SplatGenerator {
    pub fn new(
        climate: ClimateConfig,
        spec: &SplatSpec,
        seed: f64,
        sea_level: f64,
        meters_per_sample: f64,
    ) -> Result<Self, String> {
        if spec.palette.len() > MAX_SPLAT_LAYERS {
            return Err(format!(
                "The climate uses {} materials; a splat map holds {MAX_SPLAT_LAYERS}.",
                spec.palette.len()
            ));
        }
        let channel = |material: &str| {
            spec.palette
                .iter()
                .position(|m| m == material)
                .ok_or_else(|| format!("Material '{material}' is not in the splat palette."))
        };

        let mut channels = Vec::with_capacity(climate.biomes.len());
        let mut layer_noise = Vec::with_capacity(climate.biomes.len());
        for biome in &climate.biomes {
            channels.push(biome.layers.iter().map(|l| channel(&l.material)).collect::<Result<Vec<_>, _>>()?);
            layer_noise.push(
                biome
                    .layers
                    .iter()
                    .map(|l| {
                        l.noise.as_ref().map(|n| {
                            let mut rng = ParkMiller::new(seed + n.seed_salt);
                            let x = rng.offset();
                            (x, rng.offset())
                        })
                    })
                    .collect(),
            );
        }

        let coast_channels = match (&climate.coast, &climate.continent, spec.coast_materials.as_slice()) {
            (Some(_), Some(_), [sand, wet, seabed]) => Some([channel(sand)?, channel(wet)?, channel(seabed)?]),
            _ => None,
        };

        Ok(Self {
            field: ClimateField::new(seed, &climate),
            simplex: Simplex::new(seed),
            climate,
            sea_level,
            meters_per_sample,
            channels,
            layer_noise,
            coast_channels,
        })
    }

    /// Slope in degrees at sample (x, y): the central difference, one-sided at
    /// the edges.
    fn slope_at(&self, heights: &[f32], width: usize, height: usize, x: usize, y: usize) -> f64 {
        let (x0, x1) = (x.saturating_sub(1), (x + 1).min(width - 1));
        let (y0, y1) = (y.saturating_sub(1), (y + 1).min(height - 1));
        let at = |x: usize, y: usize| heights[y * width + x] as f64;
        let dx = (at(x1, y) - at(x0, y)) / ((x1 - x0) as f64 * self.meters_per_sample);
        let dy = (at(x, y1) - at(x, y0)) / ((y1 - y0) as f64 * self.meters_per_sample);
        (dx * dx + dy * dy).sqrt().atan().to_degrees()
    }

    /// Writes the texels in `region` of a `width` × `height` chunk at chunk
    /// offset (`offset_x`, `offset_y`) into `out`, which holds the whole map as
    /// two planes: every texel's channels 0-3, then every texel's 4-7.
    #[allow(clippy::too_many_arguments)]
    pub fn generate(
        &self,
        heights: &[f32],
        width: usize,
        height: usize,
        offset_x: f64,
        offset_y: f64,
        mask: Option<&PaintMask>,
        region: Region,
        out: &mut [u8],
    ) {
        let climate = &self.climate;
        let x_start = offset_x - width as f64 / 2.0;
        let y_start = -offset_y - height as f64 / 2.0;
        let grid = self.field.grid(
            climate,
            &self.simplex,
            x_start + region.x0 as f64,
            y_start + region.y0 as f64,
            region.x1 - region.x0 + 1,
            region.y1 - region.y0 + 1,
        );

        let biome_count = climate.biomes.len();
        let max_layers = climate.biomes.iter().map(|b| b.layers.len()).max().unwrap_or(1).max(1);
        // Painted biomes merge with up to four climate biomes.
        let mut biomes = vec![0usize; biome_count + 4];
        let mut weights = vec![0.0; biome_count + 4];
        let mut paint = vec![0.0; mask.map_or(0, |m| m.channels)];
        let mut weights_by_layer = vec![0.0; max_layers];
        let plane = width * height * 4;

        for y in region.y0..=region.y1 {
            let wy = y_start + y as f64;
            for x in region.x0..=region.x1 {
                let wx = x_start + x as f64;
                let index = x + y * width;
                let ground = heights[index] as f64;
                let slope = self.slope_at(heights, width, height, x, y);
                let values = grid.at(wx, wy);

                // Paint takes its weight outright; the climate keeps the rest.
                let mut count = 0;
                let mut painted = 0.0;
                if let Some(mask) = mask {
                    painted = mask.sample(x as f64, y as f64, &mut paint);
                    for (c, &w) in paint.iter().enumerate() {
                        if w > 0.0 {
                            biomes[count] = c;
                            weights[count] = w;
                            count += 1;
                        }
                    }
                }
                let climate_share = 1.0 - painted;
                if climate_share > 0.0 {
                    let blend = resolve_biomes(climate, &values);
                    for i in 0..blend.count {
                        let (biome, w) = (blend.biomes[i], blend.weights[i] * climate_share);
                        match biomes[..count].iter().position(|&b| b == biome) {
                            Some(j) => weights[j] += w,
                            None => {
                                biomes[count] = biome;
                                weights[count] = w;
                                count += 1;
                            }
                        }
                    }
                }

                let mut splat = [0.0; MAX_SPLAT_LAYERS];
                for b in 0..count {
                    let biome = biomes[b];
                    let layers = &climate.biomes[biome].layers;
                    let noise = |l: usize| {
                        let (ox, oy) = self.layer_noise[biome][l].unwrap_or_default();
                        let scale = layers[l].noise.as_ref().map_or(1.0, |n| n.scale);
                        (self.simplex.noise((wx + ox) / scale, (wy - oy) / scale) + 1.0) * 0.5
                    };
                    layer_weights(layers, ground, slope, noise, &mut weights_by_layer);
                    for (l, &channel) in self.channels[biome].iter().enumerate() {
                        splat[channel] += weights[b] * weights_by_layer[l];
                    }
                }

                // The beach covers the biome layers the way a layer covers
                // those beneath it.
                if let (Some(coast_channels), Some(coast), Some(continent)) =
                    (self.coast_channels, &climate.coast, &climate.continent)
                {
                    let above_sea = ground - self.sea_level;
                    if above_sea < coast.beach_height + coast.blend {
                        let nearness = ocean_coverage(continent, values.continent);
                        if nearness > 0.0 {
                            let ramp = |from: f64, to: f64| smoothstep01((above_sea - from) / (to - from));
                            let total = nearness
                                * band_coverage(&coast.slope, slope)
                                * ramp(coast.beach_height + coast.blend, coast.beach_height);
                            let wet_below = ramp(coast.wet_height + coast.blend, coast.wet_height);
                            let seabed = ramp(-coast.seabed_depth + coast.blend, -coast.seabed_depth);
                            let wet = fast_max(wet_below, seabed);
                            if total > 0.0 {
                                for weight in splat.iter_mut() {
                                    *weight *= 1.0 - total;
                                }
                                splat[coast_channels[0]] += total * (1.0 - wet);
                                splat[coast_channels[1]] += total * (wet - seabed);
                                splat[coast_channels[2]] += total * seabed;
                            }
                        }
                    }
                }

                // Quantising loses up to 1/255 a channel; the shader renormalises.
                let base = index * 4;
                for c in 0..4 {
                    out[base + c] = (splat[c] * 255.0).round() as u8;
                    out[plane + base + c] = (splat[4 + c] * 255.0).round() as u8;
                }
            }
        }
    }
}
