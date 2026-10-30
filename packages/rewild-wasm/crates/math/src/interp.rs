//! Interpolation helpers.

/// Smoothstep of `t` clamped to 0..1.
#[inline(always)]
pub fn smoothstep01(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Smoothstep of `x` from `min` to `max`, as `smoothstep` in `MathUtils.ts`.
#[inline(always)]
pub fn smoothstep(x: f64, min: f64, max: f64) -> f64 {
    if x <= min {
        return 0.0;
    }
    if x >= max {
        return 1.0;
    }
    let t = (x - min) / (max - min);
    t * t * (3.0 - 2.0 * t)
}

/// `x` to `y` by `t`, as `lerp` in `MathUtils.ts`.
#[inline(always)]
pub fn lerp(x: f64, y: f64, t: f64) -> f64 {
    (1.0 - t) * x + t * y
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
