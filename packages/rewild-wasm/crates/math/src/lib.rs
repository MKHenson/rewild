//! Math shared by the rewild crates. The Rust side of `rewild-common/math`:
//! where a TS counterpart exists, results match it.

pub mod curve;
pub mod interp;
pub mod lanes;
pub mod rng;
pub mod simplex;

pub use curve::PowerCurve;
pub use interp::smoothstep01;
pub use lanes::F64x2;
pub use rng::ParkMiller;
pub use simplex::Simplex;
