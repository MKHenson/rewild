//! Splat maps: per texel, the weight of each palette material. A port of
//! `generateSplatMap` in `Splat.ts`.
//!
//! The climate (or the author's paint) decides which biome a texel is in; the
//! biome's layer rules, read off the chunk's actual heights, decide which of its
//! materials. Climate owes nothing to the heights, so a sculpted chunk resolves
//! the same way a generated one does.

use serde::Deserialize;

use crate::climate::{ocean_coverage, resolve_biomes, ClimateField, ClimateSample};
use crate::config::{Band, ClimateConfig, CoastConfig, Layer, Selector};
use crate::paint::{ActiveBiomes, PaintMask};
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

/// An inclusive window of texels.
#[derive(Clone, Copy)]
pub struct Region {
    pub x0: usize,
    pub y0: usize,
    pub x1: usize,
    pub y1: usize,
}

pub(crate) fn band_coverage(band: &Band, value: f64) -> f64 {
    smoothstep01((value - band.from) / (band.to - band.from))
}

/// A selector's coverage of `value`: one band's ramp, or the product of
/// several. 1 with no selector.
pub(crate) fn selector_coverage(selector: Option<&Selector>, value: f64) -> f64 {
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

/// The beach's share at a sample, and its split into dry sand, wet sand and
/// sea bed. `above_sea` is the height above sea level, `nearness` how close the
/// ocean is (`ocean_coverage`).
pub(crate) fn coast_weights(coast: &CoastConfig, above_sea: f64, slope: f64, nearness: f64) -> (f64, [f64; 3]) {
    let ramp = |from: f64, to: f64| smoothstep01((above_sea - from) / (to - from));
    let total = nearness * band_coverage(&coast.slope, slope) * ramp(coast.beach_height + coast.blend, coast.beach_height);
    // Each band covers everything below its top, so the wet share includes the
    // sea bed's. The max keeps the wet sand whole when the blends overlap.
    let wet_below = ramp(coast.wet_height + coast.blend, coast.wet_height);
    let seabed = ramp(-coast.seabed_depth + coast.blend, -coast.seabed_depth);
    let wet = fast_max(wet_below, seabed);
    (total, [total * (1.0 - wet), total * (wet - seabed), total * seabed])
}

/// The height gradient at sample (x, y) of a `width` × `height` field, as
/// (dh/dx, dh/dy) per metre: the central difference, one-sided at the edges.
pub(crate) fn gradient_at(heights: &[f32], width: usize, height: usize, x: usize, y: usize, spacing: f64) -> (f64, f64) {
    let (x0, x1) = (x.saturating_sub(1), (x + 1).min(width - 1));
    let (y0, y1) = (y.saturating_sub(1), (y + 1).min(height - 1));
    let at = |x: usize, y: usize| heights[y * width + x] as f64;
    (
        (at(x1, y) - at(x0, y)) / ((x1 - x0) as f64 * spacing),
        (at(x, y1) - at(x, y0)) / ((y1 - y0) as f64 * spacing),
    )
}

/// Slope in degrees at sample (x, y). See `gradient_at`.
pub(crate) fn slope_at(heights: &[f32], width: usize, height: usize, x: usize, y: usize, spacing: f64) -> f64 {
    let (dx, dy) = gradient_at(heights, width, height, x, y, spacing);
    (dx * dx + dy * dy).sqrt().atan().to_degrees()
}

/// One biome's layer weights at a sample into `out[..layers.len()]`, summing
/// to one. Base first, like painting: from the top down each layer takes its
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

// Noise values a mean coverage averages over.
const MEAN_NOISE_STEPS: usize = 64;

/// The share of the ground a layer's noise selector covers, averaged over
/// noise values spread evenly across 0..1. 1 without one.
pub fn mean_noise_coverage(layer: &Layer) -> f64 {
    let Some(noise) = &layer.noise else {
        return 1.0;
    };
    let sum: f64 = (0..MEAN_NOISE_STEPS)
        .map(|i| band_coverage(&noise.band, (i as f64 + 0.5) / MEAN_NOISE_STEPS as f64))
        .sum();
    sum / MEAN_NOISE_STEPS as f64
}

/// `layer_weights` for ground seen from too far for noise patches to resolve:
/// each noise selector is taken at its mean coverage, `noise_coverage[l]`.
pub fn mean_layer_weights(layers: &[Layer], height: f64, slope: f64, noise_coverage: &[f64], out: &mut [f64]) {
    let mut remaining = 1.0;
    for l in (1..layers.len()).rev() {
        let layer = &layers[l];
        let noise = if layer.noise.is_some() { noise_coverage[l] } else { 1.0 };
        let covered = selector_coverage(layer.slope.as_ref(), slope)
            * selector_coverage(layer.height.as_ref(), height)
            * noise
            * remaining;
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
    /// Each biome's each layer's mean noise coverage, for far maps.
    mean_noise: Vec<Vec<f64>>,
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

        let mean_noise = climate.biomes.iter().map(|b| b.layers.iter().map(mean_noise_coverage).collect()).collect();
        Ok(Self {
            field: ClimateField::new(seed, &climate),
            simplex: Simplex::new(seed),
            climate,
            sea_level,
            meters_per_sample,
            channels,
            layer_noise,
            coast_channels,
            mean_noise,
        })
    }

    /// The most layers any biome has.
    pub fn max_layers(&self) -> usize {
        self.climate.biomes.iter().map(|b| b.layers.len()).max().unwrap_or(1).max(1)
    }

    /// One far map texel's palette weights, summing to 1: the splat's rules
    /// with each noise selector at its mean coverage. `values` are the climate
    /// there, `slope` in degrees across the texel. `layer_weights` is scratch
    /// of `max_layers()`.
    pub fn far_texel(
        &self,
        values: &ClimateSample,
        height: f64,
        slope: f64,
        layer_weights: &mut [f64],
    ) -> [f64; MAX_SPLAT_LAYERS] {
        let climate = &self.climate;
        let mut out = [0.0; MAX_SPLAT_LAYERS];
        let blend = resolve_biomes(climate, values);
        for b in 0..blend.count {
            let biome = blend.biomes[b];
            mean_layer_weights(&climate.biomes[biome].layers, height, slope, &self.mean_noise[biome], layer_weights);
            for (l, &channel) in self.channels[biome].iter().enumerate() {
                out[channel] += blend.weights[b] * layer_weights[l];
            }
        }
        if let (Some(coast_channels), Some(coast), Some(continent)) =
            (self.coast_channels, &climate.coast, &climate.continent)
        {
            let above_sea = height - self.sea_level;
            if above_sea < coast.beach_height + coast.blend {
                let nearness = ocean_coverage(continent, values.continent);
                if nearness > 0.0 {
                    let (total, [dry, wet, seabed]) = coast_weights(coast, above_sea, slope, nearness);
                    if total > 0.0 {
                        for weight in out.iter_mut() {
                            *weight *= 1.0 - total;
                        }
                        out[coast_channels[0]] += dry;
                        out[coast_channels[1]] += wet;
                        out[coast_channels[2]] += seabed;
                    }
                }
            }
        }
        out
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

        let max_layers = climate.biomes.iter().map(|b| b.layers.len()).max().unwrap_or(1).max(1);
        let mut active = ActiveBiomes::new(climate, mask);
        let mut weights_by_layer = vec![0.0; max_layers];
        let plane = width * height * 4;

        for y in region.y0..=region.y1 {
            let wy = y_start + y as f64;
            for x in region.x0..=region.x1 {
                let wx = x_start + x as f64;
                let index = x + y * width;
                let ground = heights[index] as f64;
                let slope = slope_at(heights, width, height, x, y, self.meters_per_sample);
                let values = grid.at(wx, wy);

                active.resolve(climate, &values, mask, x as f64, y as f64);

                let mut splat = [0.0; MAX_SPLAT_LAYERS];
                for b in 0..active.count {
                    let biome = active.biomes[b];
                    let layers = &climate.biomes[biome].layers;
                    let noise = |l: usize| {
                        let (ox, oy) = self.layer_noise[biome][l].unwrap_or_default();
                        let scale = layers[l].noise.as_ref().map_or(1.0, |n| n.scale);
                        (self.simplex.noise((wx + ox) / scale, (wy - oy) / scale) + 1.0) * 0.5
                    };
                    layer_weights(layers, ground, slope, noise, &mut weights_by_layer);
                    for (l, &channel) in self.channels[biome].iter().enumerate() {
                        splat[channel] += active.weights[b] * weights_by_layer[l];
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
                            let (total, [dry, wet, seabed]) = coast_weights(coast, above_sea, slope, nearness);
                            if total > 0.0 {
                                for weight in splat.iter_mut() {
                                    *weight *= 1.0 - total;
                                }
                                splat[coast_channels[0]] += dry;
                                splat[coast_channels[1]] += wet;
                                splat[coast_channels[2]] += seabed;
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
