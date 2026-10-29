//! Minimum and maximum without NaN handling.
//!
//! `f32::min` and `f64::min` must propagate NaN and order -0 below +0. ARM has
//! an instruction for that; on x64, V8 emits several for each call. These are
//! one compare and select. Inputs must not be NaN.

#[inline(always)]
pub fn fast_min<T: PartialOrd>(a: T, b: T) -> T {
    if a < b {
        a
    } else {
        b
    }
}

#[inline(always)]
pub fn fast_max<T: PartialOrd>(a: T, b: T) -> T {
    if a > b {
        a
    } else {
        b
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_arch = "wasm32")]
    use wasm_bindgen_test::wasm_bindgen_test as test;

    #[test]
    fn picks_the_smaller_and_the_larger() {
        assert_eq!(fast_min(1.5f64, -2.0), -2.0);
        assert_eq!(fast_max(1.5f64, -2.0), 1.5);
        assert_eq!(fast_min(3.0f32, 3.0), 3.0);
        assert_eq!(fast_max(f32::NEG_INFINITY, 0.25), 0.25);
    }
}
