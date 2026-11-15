//! Lookups into a row-major heightfield, addressed in samples: (x, y) is
//! column x of row y.

use math::lerp;

/// The height between samples, bilinear so a point off the grid does not step
/// down it. Clamped onto the field's edge.
pub fn sample_bilinear(heights: &[f32], size: usize, x: f64, y: f64) -> f64 {
    let max = (size - 1) as f64;
    let x0 = x.floor().clamp(0.0, max);
    let y0 = y.floor().clamp(0.0, max);
    let (x1, y1) = ((x0 + 1.0).min(max), (y0 + 1.0).min(max));
    let at = |x: f64, y: f64| heights[y as usize * size + x as usize] as f64;
    let (tx, ty) = (x - x0, y - y0);
    lerp(lerp(at(x0, y0), at(x1, y0), tx), lerp(at(x0, y1), at(x1, y1), tx), ty)
}

/// The sample index nearest `v` along an axis of `size` samples.
pub fn nearest_index(v: f64, size: usize) -> usize {
    v.round().clamp(0.0, (size - 1) as f64) as usize
}

/// The height gradient at sample (x, y) of a `width` × `height` field, as
/// (dh/dx, dh/dy) per metre: the central difference, one-sided at the edges.
pub fn gradient_at(heights: &[f32], width: usize, height: usize, x: usize, y: usize, spacing: f64) -> (f64, f64) {
    let (x0, x1) = (x.saturating_sub(1), (x + 1).min(width - 1));
    let (y0, y1) = (y.saturating_sub(1), (y + 1).min(height - 1));
    let at = |x: usize, y: usize| heights[y * width + x] as f64;
    (
        (at(x1, y) - at(x0, y)) / ((x1 - x0) as f64 * spacing),
        (at(x, y1) - at(x, y0)) / ((y1 - y0) as f64 * spacing),
    )
}

/// Slope in degrees at sample (x, y). See `gradient_at`.
pub fn slope_at(heights: &[f32], width: usize, height: usize, x: usize, y: usize, spacing: f64) -> f64 {
    let (dx, dy) = gradient_at(heights, width, height, x, y, spacing);
    (dx * dx + dy * dy).sqrt().atan().to_degrees()
}
