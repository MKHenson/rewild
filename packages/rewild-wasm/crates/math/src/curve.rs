//! Power curves over 0..1 from a table. `powf` is a software libm call in
//! WASM; a table read and a lerp is a few instructions.

/// Table steps over 0..1. At this resolution a lerped curve stays within
/// 4e-6 of the exact one for exponents of 1 and up, worst just above 0.
const STEPS: usize = 4096;

/// `n.powf(exponent)` for `n` in 0..1. Inputs outside are clamped.
///
/// An exponent below 1 rises infinitely steeply from 0, which no table
/// follows, so those curves call `powf`.
pub struct PowerCurve {
    exponent: f64,
    table: Vec<f64>,
}

impl PowerCurve {
    pub fn new(exponent: f64) -> Self {
        let table = if exponent >= 1.0 {
            (0..=STEPS)
                .map(|i| (i as f64 / STEPS as f64).powf(exponent))
                .collect()
        } else {
            Vec::new()
        };
        Self { exponent, table }
    }

    #[inline(always)]
    pub fn at(&self, n: f64) -> f64 {
        let n = n.clamp(0.0, 1.0);
        if self.table.is_empty() {
            return n.powf(self.exponent);
        }
        let scaled = n * STEPS as f64;
        let i = (scaled as usize).min(STEPS - 1);
        let t = scaled - i as f64;
        let (a, b) = (self.table[i], self.table[i + 1]);
        a + (b - a) * t
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_arch = "wasm32")]
    use wasm_bindgen_test::wasm_bindgen_test as test;

    #[test]
    fn follows_powf() {
        for exponent in [0.5, 1.0, 1.1, 1.45, 2.0, 3.7] {
            let curve = PowerCurve::new(exponent);
            assert_eq!(curve.at(0.0), 0.0);
            assert_eq!(curve.at(1.0), 1.0);
            for k in 0..=10000 {
                let n = k as f64 / 10000.0;
                assert!((curve.at(n) - n.powf(exponent)).abs() < 4e-6, "{exponent} at {n}");
            }
        }
    }

    #[test]
    fn clamps() {
        let curve = PowerCurve::new(2.0);
        assert_eq!(curve.at(-1.0), 0.0);
        assert_eq!(curve.at(2.0), 1.0);
    }
}
