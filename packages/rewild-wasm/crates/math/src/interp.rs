//! Interpolation helpers.

/// Smoothstep of `t` clamped to 0..1.
#[inline(always)]
pub fn smoothstep01(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_and_eases() {
        assert_eq!(smoothstep01(-1.0), 0.0);
        assert_eq!(smoothstep01(0.5), 0.5);
        assert_eq!(smoothstep01(2.0), 1.0);
        assert!(smoothstep01(0.1) < 0.1);
    }
}
