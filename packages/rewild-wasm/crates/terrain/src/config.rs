//! The parts of a climate preset that shape the ground. Mirrors the TS types in
//! `Biomes.ts`; fields the heights never read (layers, scatter, water, lakes)
//! are skipped when a preset is deserialized.

use serde::Deserialize;

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClimateConfig {
    pub temperature: ClimateAxis,
    pub moisture: ClimateAxis,
    pub continent: Option<ContinentConfig>,
    pub biomes: Vec<Biome>,
    /// `cells[temperatureBand][moistureBand]` is an index into `biomes`.
    pub cells: Vec<Vec<i64>>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClimateAxis {
    pub scale: f64,
    pub seed_salt: f64,
    pub cuts: Vec<f64>,
    pub blend_half_width: f64,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ContinentConfig {
    pub scale: f64,
    pub seed_salt: f64,
    pub coast: f64,
    pub blend_half_width: f64,
    pub shelf_width: f64,
    pub shelf_depth: f64,
    pub slope_width: f64,
    pub ocean_depth: f64,
    pub coastal_moisture: Option<f64>,
    pub coastal_moisture_reach: Option<f64>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Biome {
    pub name: String,
    pub deformations: Vec<Deformation>,
    pub erosion: Option<Erosion>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Erosion {
    pub iterations: f64,
    pub talus_deg: f64,
    pub strength: f64,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Deformation {
    Fbm(Octaves),
    Ridged(Ridged),
    Terrace(Terrace),
    Eroded(Eroded),
    Dunes(Dunes),
}

/// An octave stack of simplex noise, shared by every noise-based kind.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Octaves {
    pub amplitude: f64,
    pub noise_scale: f64,
    pub octaves: f64,
    pub persistence: f64,
    pub lacunarity: f64,
    pub curve_exp: f64,
    pub seed_salt: f64,
}

impl Octaves {
    /// Octaves summed. A fractional count rounds up, as the TS loop did.
    pub fn count(&self) -> usize {
        self.octaves.max(0.0).ceil() as usize
    }
}

#[derive(Deserialize, Clone, Debug)]
pub struct Ridged {
    #[serde(flatten)]
    pub stack: Octaves,
    pub sharpness: f64,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Terrace {
    #[serde(flatten)]
    pub stack: Octaves,
    pub steps: f64,
    pub sharpness: f64,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Eroded {
    #[serde(flatten)]
    pub stack: Octaves,
    pub erosion: f64,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Dunes {
    pub amplitude: f64,
    pub wavelength: f64,
    pub angle_deg: f64,
    pub warp: f64,
    pub warp_scale: f64,
    pub sharpness: f64,
    pub seed_salt: f64,
}
