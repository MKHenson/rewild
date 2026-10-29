//! Terrain generation. Each stage is a pure function of world position and the
//! climate preset, so any chunk can rebuild any sample on its own.

pub mod climate;
pub mod config;
pub mod heights;

pub use config::ClimateConfig;
pub use heights::HeightGenerator;

#[cfg(test)]
mod tests;
