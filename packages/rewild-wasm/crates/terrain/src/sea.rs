//! Sea biomes: what the bed under the water is made of, what grows on it and
//! what lives there. Picked by the land's temperature bands and by zone, which
//! takes the place of moisture. Land biomes still shape the ground.

use crate::climate::{resolve_axis, AxisBands};
use crate::config::{ClimateAxis, ClimateConfig, SeaConfig};
use crate::splat::{band_coverage, selector_coverage};

/// The water at one point, as the sea biomes read it.
#[derive(Clone, Copy)]
pub struct SeaWater<'a> {
    /// Metres from the bed to the surface.
    pub depth: f64,
    /// 0..1.
    pub coverage: f64,
    /// Metres to dry ground, up to `SHORE_CAP`.
    pub shore: f64,
    /// Weights over the climate's water palette.
    pub types: &'a [f64],
}

/// Resolves sea biome weights at one point after another. Scratch for one pass.
pub struct SeaResolver {
    /// Per zone, the water palette index it is weighted by. `usize::MAX` for a
    /// type the palette lacks, which weighs nothing.
    zone_types: Vec<Option<usize>>,
    zones: Vec<f64>,
    /// Per sea biome, its weight at the last point resolved.
    pub weights: Vec<f64>,
}

impl SeaResolver {
    /// None for a climate with no sea biomes.
    pub fn new(climate: &ClimateConfig) -> Option<Self> {
        let sea = climate.sea.as_ref()?;
        let zone_types = sea
            .zones
            .iter()
            .map(|z| {
                z.water_type
                    .as_ref()
                    .map(|name| climate.water.iter().position(|w| &w.name == name).unwrap_or(usize::MAX))
            })
            .collect();
        Some(Self { zone_types, zones: vec![0.0; sea.zones.len()], weights: vec![0.0; sea.biomes.len()] })
    }

    /// The sea biome weights at a point into `weights`, and their sum: the
    /// sea's share of the bed there. `temperature` is the climate's value.
    pub fn resolve(&mut self, sea: &SeaConfig, axis: &ClimateAxis, temperature: f64, water: &SeaWater) -> f64 {
        self.weights.fill(0.0);
        if water.depth <= 0.0 || water.coverage <= 0.0 {
            return 0.0;
        }
        let share = water.coverage * band_coverage(&sea.handover, water.depth);
        if share <= 0.0 {
            return 0.0;
        }

        let mut total = 0.0;
        for (z, zone) in sea.zones.iter().enumerate() {
            let typed = self.zone_types[z].map_or(1.0, |t| water.types.get(t).copied().unwrap_or(0.0));
            let weight = typed
                * selector_coverage(zone.depth.as_ref(), water.depth)
                * selector_coverage(zone.shore.as_ref(), water.shore);
            self.zones[z] = weight;
            total += weight;
        }
        if total <= 0.0 {
            return 0.0;
        }

        let t = if axis.cuts.is_empty() { AxisBands::default() } else { resolve_axis(temperature, axis) };
        let scale = share / total;
        for z in 0..sea.zones.len() {
            let weight = self.zones[z] * scale;
            if weight <= 0.0 {
                continue;
            }
            self.weights[sea.cells[t.a][z] as usize] += weight * (1.0 - t.weight);
            if t.b != t.a {
                self.weights[sea.cells[t.b][z] as usize] += weight * t.weight;
            }
        }
        share
    }
}

pub(crate) fn validate(climate: &ClimateConfig) -> Result<(), String> {
    let Some(sea) = &climate.sea else {
        return Ok(());
    };
    if !(sea.handover.from >= 0.0 && sea.handover.to > sea.handover.from) {
        return Err("Sea handover must run from a depth of at least 0 to a deeper one.".into());
    }
    if sea.zones.is_empty() || sea.biomes.is_empty() {
        return Err("A sea needs at least one zone and one biome.".into());
    }
    let t_bands = climate.temperature.cuts.len() + 1;
    if sea.cells.len() != t_bands {
        return Err(format!("Sea cells must have {t_bands} temperature rows."));
    }
    for row in &sea.cells {
        if row.len() != sea.zones.len() {
            return Err(format!("Sea cell rows must have {} zone entries.", sea.zones.len()));
        }
        for &biome in row {
            if biome < 0 || biome as usize >= sea.biomes.len() {
                return Err(format!("Sea cell biome index {biome} is out of range."));
            }
        }
    }
    Ok(())
}
