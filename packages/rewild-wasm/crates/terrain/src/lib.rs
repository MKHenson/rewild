//! Terrain generation. Each stage is a pure function of world position and the
//! climate preset, so any chunk can rebuild any sample on its own.

pub mod climate;
pub mod config;
pub mod heights;
pub mod lakes;
pub mod mesh;
pub mod splat;
pub mod water;

pub use config::ClimateConfig;
pub use heights::HeightGenerator;
pub use lakes::{CellReport, Lake, Lakes};
pub use splat::{PaintMask, Region, SplatGenerator, SplatSpec};
pub use water::{WaterEdit, WaterMap, WaterPoint, WaterSampler};

#[cfg(test)]
mod tests;
