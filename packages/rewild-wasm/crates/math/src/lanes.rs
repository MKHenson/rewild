//! Two `f64` lanes. WASM SIMD (`f64x2`) on the web build, a plain pair
//! elsewhere, so native tests run the same arithmetic. Each operation is one
//! IEEE operation per lane, so a lane computes exactly what scalar code would.

use std::ops::{Add, Mul, Sub};

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
mod imp {
    use core::arch::wasm32::*;

    #[derive(Clone, Copy)]
    pub struct F64x2(pub(super) v128);

    impl F64x2 {
        #[inline(always)]
        pub fn new(a: f64, b: f64) -> Self {
            Self(f64x2(a, b))
        }
        #[inline(always)]
        pub fn splat(v: f64) -> Self {
            Self(f64x2_splat(v))
        }
        #[inline(always)]
        pub fn to_array(self) -> [f64; 2] {
            [f64x2_extract_lane::<0>(self.0), f64x2_extract_lane::<1>(self.0)]
        }
        #[inline(always)]
        pub fn floor(self) -> Self {
            Self(f64x2_floor(self.0))
        }
        /// `self` where it is not below 0, else 0. A compare and select, which
        /// is cheaper than `max` on x64.
        #[inline(always)]
        pub fn positive(self) -> Self {
            Self(f64x2_pmax(self.0, f64x2_splat(0.0)))
        }
        #[inline(always)]
        pub(super) fn add(self, o: Self) -> Self {
            Self(f64x2_add(self.0, o.0))
        }
        #[inline(always)]
        pub(super) fn sub(self, o: Self) -> Self {
            Self(f64x2_sub(self.0, o.0))
        }
        #[inline(always)]
        pub(super) fn mul(self, o: Self) -> Self {
            Self(f64x2_mul(self.0, o.0))
        }
    }
}

#[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
mod imp {
    #[derive(Clone, Copy)]
    pub struct F64x2(pub(super) [f64; 2]);

    impl F64x2 {
        #[inline(always)]
        pub fn new(a: f64, b: f64) -> Self {
            Self([a, b])
        }
        #[inline(always)]
        pub fn splat(v: f64) -> Self {
            Self([v, v])
        }
        #[inline(always)]
        pub fn to_array(self) -> [f64; 2] {
            self.0
        }
        #[inline(always)]
        pub fn floor(self) -> Self {
            Self(self.0.map(f64::floor))
        }
        /// `self` where it is not below 0, else 0. Matches `f64x2_pmax`.
        #[inline(always)]
        pub fn positive(self) -> Self {
            Self(self.0.map(|v| if v < 0.0 { 0.0 } else { v }))
        }
        #[inline(always)]
        pub(super) fn add(self, o: Self) -> Self {
            Self([self.0[0] + o.0[0], self.0[1] + o.0[1]])
        }
        #[inline(always)]
        pub(super) fn sub(self, o: Self) -> Self {
            Self([self.0[0] - o.0[0], self.0[1] - o.0[1]])
        }
        #[inline(always)]
        pub(super) fn mul(self, o: Self) -> Self {
            Self([self.0[0] * o.0[0], self.0[1] * o.0[1]])
        }
    }
}

pub use imp::F64x2;

impl Add for F64x2 {
    type Output = Self;
    #[inline(always)]
    fn add(self, o: Self) -> Self {
        F64x2::add(self, o)
    }
}

impl Sub for F64x2 {
    type Output = Self;
    #[inline(always)]
    fn sub(self, o: Self) -> Self {
        F64x2::sub(self, o)
    }
}

impl Mul for F64x2 {
    type Output = Self;
    #[inline(always)]
    fn mul(self, o: Self) -> Self {
        F64x2::mul(self, o)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_arch = "wasm32")]
    use wasm_bindgen_test::wasm_bindgen_test as test;

    #[test]
    fn works_lane_by_lane() {
        let a = F64x2::new(1.5, -2.25);
        let b = F64x2::new(0.5, 4.0);
        assert_eq!((a + b).to_array(), [2.0, 1.75]);
        assert_eq!((a - b).to_array(), [1.0, -6.25]);
        assert_eq!((a * b).to_array(), [0.75, -9.0]);
        assert_eq!(a.floor().to_array(), [1.0, -3.0]);
        assert_eq!(a.positive().to_array(), [1.5, 0.0]);
        assert_eq!(F64x2::splat(3.0).to_array(), [3.0, 3.0]);
    }
}
