//! Math shared by the rewild crates. The Rust side of `rewild-common/math`:
//! where a TS counterpart exists, results match it.

pub mod curve;
pub mod hash;
pub mod interp;
pub mod lanes;
pub mod minmax;
pub mod rng;
pub mod simplex;

pub use curve::PowerCurve;
pub use hash::{hash01, hash_cell, mix_hash, to_int32};
pub use interp::{lerp, smoothstep, smoothstep01};
pub use lanes::F64x2;
pub use minmax::{fast_max, fast_min};
pub use rng::ParkMiller;
pub use simplex::Simplex;
