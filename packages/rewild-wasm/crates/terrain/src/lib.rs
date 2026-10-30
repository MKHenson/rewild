//! Terrain generation. Each stage is a pure function of world position and the
//! climate preset, so any chunk can rebuild any sample on its own.

pub mod climate;
pub mod config;
pub mod edit;
pub mod far;
pub mod heights;
pub mod lakes;
pub mod mesh;
pub mod paint;
pub mod scatter;
pub mod splat;
pub mod water;

pub use config::ClimateConfig;
pub use far::FarMap;
pub use heights::HeightGenerator;
pub use lakes::{CellReport, Lake, Lakes};
pub use paint::PaintMask;
pub use scatter::{ScatterGenerator, ScatterLayer, ScatterRequest};
pub use splat::{Region, SplatGenerator, SplatSpec};
pub use water::{WaterEdit, WaterMap, WaterPoint, WaterSampler};

#[cfg(test)]
mod tests;
