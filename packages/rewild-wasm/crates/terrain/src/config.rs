//! The parts of a climate preset that shape, surface and flood the ground.
//! Mirrors the TS types in `Biomes.ts`; fields no ported stage reads yet
//! (scatter) are skipped when a preset is deserialized.

use serde::{Deserialize, Deserializer};

/// A field that may be absent, null or undefined, any of which mean its
/// default.
fn or_default<'de, D: Deserializer<'de>, T: Default + Deserialize<'de>>(d: D) -> Result<T, D::Error> {
    Ok(Option::<T>::deserialize(d)?.unwrap_or_default())
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClimateConfig {
    pub temperature: ClimateAxis,
    pub moisture: ClimateAxis,
    pub continent: Option<ContinentConfig>,
    pub coast: Option<CoastConfig>,
    /// The water palette a water map's type weights index.
    #[serde(default, deserialize_with = "or_default")]
    pub water: Vec<WaterType>,
    pub lakes: Option<LakeConfig>,
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

/// Beaches where the ocean is close. Materials come in the splat palette.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CoastConfig {
    pub beach_height: f64,
    pub wet_height: f64,
    pub seabed_depth: f64,
    pub blend: f64,
    pub slope: Band,
}

/// One entry of the water palette. Only its name matters here.
#[derive(Deserialize, Clone, Debug)]
pub struct WaterType {
    pub name: String,
}

/// Seeded lakes, at most one per cell. Lengths are in samples.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LakeConfig {
    pub cell_size: f64,
    pub seed_salt: f64,
    /// Share of cells that try to hold a lake.
    pub chance: f64,
    /// Shore radius, picked per lake.
    pub radius: Band,
    /// How far the shore wanders from a circle, as a share of the radius.
    pub irregularity: f64,
    /// The bank's reach as a multiple of the shore radius. The rim is sampled
    /// there.
    pub bank: f64,
    /// Metres at the centre, picked per lake.
    pub depth: Band,
    /// Metres the lip stands above the level.
    pub margin: f64,
    /// Degrees of rim spread over the rim radius. A steeper site is rejected.
    pub max_rim_slope: f64,
    /// The same for a lagoon, over its dry rim only.
    pub max_lagoon_slope: f64,
    /// Share of candidates out at sea that slide ashore to try for a lagoon.
    pub lagoon_chance: f64,
    pub lagoon_radius: Band,
    /// Past the bank, as a multiple of the shore radius: where a raised lip
    /// eases back down to the ground.
    pub moraine: f64,
    /// Shore kept between the banks of neighbouring lakes.
    pub spacing: f64,
    /// Without it, a site too steep for a lake stays dry.
    pub tarns: Option<TarnConfig>,
}

/// A small lake in a cirque, tried where a site is too steep for a lake.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TarnConfig {
    pub radius: Band,
    pub max_rim_slope: f64,
    /// How far up the rim's spread the level sits, 0..1.
    pub lip_share: f64,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Biome {
    pub name: String,
    pub deformations: Vec<Deformation>,
    pub erosion: Option<Erosion>,
    /// Surfaces the shape, base first.
    #[serde(default, deserialize_with = "or_default")]
    pub layers: Vec<Layer>,
    /// What grows here, one rule per scatter layer.
    #[serde(default, deserialize_with = "or_default")]
    pub scatter: Vec<ScatterRule>,
}

/// How densely a biome grows one scatter layer. Rules do not composite: each
/// is its own density field.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScatterRule {
    /// The scatter layer's name.
    pub layer: String,
    /// Share of what the layer's footprint allows.
    pub density: f64,
    /// Degrees from horizontal.
    pub slope: Option<Selector>,
    /// Absolute world metres.
    pub height: Option<Selector>,
    pub noise: Option<NoiseSelector>,
    /// Metres below the water surface; negative is height above it.
    pub water_depth: Option<Selector>,
    /// Grows only where this water type has weight.
    pub water_type: Option<String>,
    /// Grows under water. Otherwise the rule stops at the waterline.
    #[serde(default, deserialize_with = "or_default")]
    pub underwater: bool,
}

/// A smoothstep ramp from `from` to `to`. `from` above `to` fades out instead.
#[derive(Deserialize, Clone, Copy, Debug)]
pub struct Band {
    pub from: f64,
    pub to: f64,
}

/// One band, or several that must all apply.
#[derive(Deserialize, Clone, Debug)]
#[serde(untagged)]
pub enum Selector {
    One(Band),
    All(Vec<Band>),
}

/// Organic patches from a noise field of their own.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NoiseSelector {
    pub scale: f64,
    pub seed_salt: f64,
    pub band: Band,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Layer {
    pub material: String,
    /// Degrees from horizontal.
    pub slope: Option<Selector>,
    /// Absolute world metres.
    pub height: Option<Selector>,
    pub noise: Option<NoiseSelector>,
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
