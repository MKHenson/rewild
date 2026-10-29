//! 2D simplex noise. A port of `Perlin.simplex2` and `Perlin.simplex2d` in
//! rewild-common, seeded the same way.
//!
//! Coordinates are `f64`. Field offsets reach ±100000 samples, where `f32`
//! cannot resolve a sample step, so fine octaves would show steps.

use crate::lanes::F64x2;

const SQRT_3: f64 = 1.7320508075688772;
const F2: f64 = 0.5 * (SQRT_3 - 1.0);
const G2: f64 = (3.0 - SQRT_3) / 6.0;

const PERMUTATION: [u8; 256] = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69,
    142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219,
    203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
    74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230,
    220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76,
    132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173,
    186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206,
    59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163,
    70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232,
    178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162,
    241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204,
    176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141,
    128, 195, 78, 66, 215, 61, 156, 180,
];

/// The x and y of the twelve 3D gradients; 2D noise ignores z.
const GRAD: [(f64, f64); 12] = [
    (1.0, 1.0),
    (-1.0, 1.0),
    (1.0, -1.0),
    (-1.0, -1.0),
    (1.0, 0.0),
    (-1.0, 0.0),
    (1.0, 0.0),
    (-1.0, 0.0),
    (0.0, 1.0),
    (0.0, -1.0),
    (0.0, 1.0),
    (0.0, -1.0),
];

pub struct Simplex {
    perm: [u8; 512],
    grad: [(f64, f64); 512],
}

/// JS `ToInt32`: what a bitwise operator does to a number.
fn to_int32(value: f64) -> i32 {
    if !value.is_finite() {
        return 0;
    }
    (value.trunc() % 4294967296.0) as i64 as u32 as i32
}

impl Simplex {
    pub fn new(seed: f64) -> Self {
        let mut seed = seed;
        if seed > 0.0 && seed < 1.0 {
            seed *= 65536.0;
        }
        let seed = seed.floor();
        let mut s = to_int32(seed);
        if seed < 256.0 {
            s |= s.wrapping_shl(8);
        }

        let mut perm = [0u8; 512];
        let mut grad = [(0.0, 0.0); 512];
        for i in 0..256 {
            let salt = if i & 1 == 1 { s & 255 } else { (s >> 8) & 255 };
            let v = PERMUTATION[i] ^ salt as u8;
            perm[i] = v;
            perm[i + 256] = v;
            grad[i] = GRAD[v as usize % 12];
            grad[i + 256] = grad[i];
        }
        Self { perm, grad }
    }

    /// The three corners of the simplex cell holding (x, y): each corner's
    /// gradient and its offset from (x, y).
    #[inline(always)]
    fn corners(&self, x: f64, y: f64) -> [((f64, f64), f64, f64); 3] {
        let s = (x + y) * F2;
        let i = (x + s).floor();
        let j = (y + s).floor();
        let t = (i + j) * G2;
        let x0 = x - i + t;
        let y0 = y - j + t;

        let (i1, j1) = if x0 > y0 { (1, 0) } else { (0, 1) };
        let x1 = x0 - i1 as f64 + G2;
        let y1 = y0 - j1 as f64 + G2;
        let x2 = x0 - 1.0 + 2.0 * G2;
        let y2 = y0 - 1.0 + 2.0 * G2;

        // Every index is under 512 already; the masks let the compiler drop
        // the bounds checks.
        let i = (i as i64 & 255) as usize;
        let j = (j as i64 & 255) as usize;
        let perm = &self.perm;
        let grad = |k: usize| self.grad[k & 511];
        [
            (grad(i + perm[j] as usize), x0, y0),
            (grad(i + i1 + perm[(j + j1) & 511] as usize), x1, y1),
            (grad(i + 1 + perm[(j + 1) & 511] as usize), x2, y2),
        ]
    }

    /// Noise in -1..1.
    pub fn noise(&self, x: f64, y: f64) -> f64 {
        let mut n = 0.0;
        for ((gx, gy), cx, cy) in self.corners(x, y) {
            let t = 0.5 - cx * cx - cy * cy;
            if t >= 0.0 {
                let t2 = t * t;
                n += t2 * t2 * (gx * cx + gy * cy);
            }
        }
        70.0 * n
    }

    /// Noise and its analytic gradient, as `(value, d/dx, d/dy)`. The value is
    /// exactly `noise`'s.
    pub fn noise_with_gradient(&self, x: f64, y: f64) -> (f64, f64, f64) {
        let mut n = 0.0;
        let mut dx = 0.0;
        let mut dy = 0.0;
        for ((gx, gy), cx, cy) in self.corners(x, y) {
            let t = 0.5 - cx * cx - cy * cy;
            if t > 0.0 {
                let t2 = t * t;
                let dot = gx * cx + gy * cy;
                n += t2 * t2 * dot;
                let w = 8.0 * t2 * t * dot;
                dx += t2 * t2 * gx - w * cx;
                dy += t2 * t2 * gy - w * cy;
            }
        }
        (70.0 * n, 70.0 * dx, 70.0 * dy)
    }

    /// The corners of the simplex cells holding two points, as
    /// `(gradient x, gradient y, offset x, offset y)` per corner. The same
    /// operations as `corners`, so each lane matches it exactly.
    #[inline(always)]
    fn corners2(&self, x: F64x2, y: F64x2) -> [(F64x2, F64x2, F64x2, F64x2); 3] {
        let s = (x + y) * F64x2::splat(F2);
        let i = (x + s).floor();
        let j = (y + s).floor();
        let t = (i + j) * F64x2::splat(G2);
        let x0 = x - i + t;
        let y0 = y - j + t;

        // The lattice lookups have no SIMD form, so each lane does its own.
        let (xs, ys) = (x0.to_array(), y0.to_array());
        let (is, js) = (i.to_array(), j.to_array());
        let perm = &self.perm;
        let grad = |k: usize| self.grad[k & 511];
        let mut lower = [0.0; 2];
        let mut g = [[(0.0, 0.0); 2]; 3];
        for lane in 0..2 {
            let i1 = (xs[lane] > ys[lane]) as usize;
            let j1 = 1 - i1;
            lower[lane] = i1 as f64;
            let i = (is[lane] as i64 & 255) as usize;
            let j = (js[lane] as i64 & 255) as usize;
            g[0][lane] = grad(i + perm[j] as usize);
            g[1][lane] = grad(i + i1 + perm[(j + j1) & 511] as usize);
            g[2][lane] = grad(i + 1 + perm[(j + 1) & 511] as usize);
        }
        let i1 = F64x2::new(lower[0], lower[1]);
        let j1 = F64x2::new(1.0 - lower[0], 1.0 - lower[1]);

        let g2 = F64x2::splat(G2);
        let x1 = x0 - i1 + g2;
        let y1 = y0 - j1 + g2;
        let one = F64x2::splat(1.0);
        let g2x2 = F64x2::splat(2.0 * G2);
        let x2 = x0 - one + g2x2;
        let y2 = y0 - one + g2x2;

        let gx = |c: usize| F64x2::new(g[c][0].0, g[c][1].0);
        let gy = |c: usize| F64x2::new(g[c][0].1, g[c][1].1);
        [(gx(0), gy(0), x0, y0), (gx(1), gy(1), x1, y1), (gx(2), gy(2), x2, y2)]
    }

    /// `noise` at two points at once.
    pub fn noise2(&self, x: F64x2, y: F64x2) -> [f64; 2] {
        let half = F64x2::splat(0.5);
        let mut n = F64x2::splat(0.0);
        for (gx, gy, cx, cy) in self.corners2(x, y) {
            // A corner outside its radius adds zero, as the scalar branch does.
            let t = (half - cx * cx - cy * cy).positive();
            let t2 = t * t;
            n = n + t2 * t2 * (gx * cx + gy * cy);
        }
        (n * F64x2::splat(70.0)).to_array()
    }

    /// `noise_with_gradient` at two points at once, as `(values, d/dx, d/dy)`.
    pub fn noise_with_gradient2(&self, x: F64x2, y: F64x2) -> ([f64; 2], [f64; 2], [f64; 2]) {
        let half = F64x2::splat(0.5);
        let eight = F64x2::splat(8.0);
        let zero = F64x2::splat(0.0);
        let (mut n, mut dx, mut dy) = (zero, zero, zero);
        for (gx, gy, cx, cy) in self.corners2(x, y) {
            let t = (half - cx * cx - cy * cy).positive();
            let t2 = t * t;
            let t4 = t2 * t2;
            let dot = gx * cx + gy * cy;
            n = n + t4 * dot;
            let w = eight * t2 * t * dot;
            dx = dx + (t4 * gx - w * cx);
            dy = dy + (t4 * gy - w * cy);
        }
        let scale = F64x2::splat(70.0);
        ((n * scale).to_array(), (dx * scale).to_array(), (dy * scale).to_array())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_arch = "wasm32")]
    use wasm_bindgen_test::wasm_bindgen_test as test;

    // [seed, x, y, value, d/dx, d/dy] from Perlin in rewild-common.
    const REFERENCE: [[f64; 6]; 12] = [
        [1234.0, 0.3, 0.7, 0.25590506291707554, 0.9858846264728247, 1.25842584537643],
        [1234.0, -12.25, 40.5, -0.4883048848831907, 0.8633613939305902, 2.241653683349812],
        [1234.0, 1031.7, -2048.125, -0.6250331262836799, 0.021854636676442447, -0.4557445839878118],
        [1234.0, -0.001, 0.002, 0.013124475007874963, -4.374615008924921, 4.374405015224857],
        [7.0, 0.3, 0.7, -0.8774700243652702, -0.681200641489707, -0.382196296727261],
        [7.0, -12.25, 40.5, -0.8388966218935219, -1.856595161150486, 1.2598782378563416],
        [7.0, 1031.7, -2048.125, -0.16779242793607996, -0.15395508308018074, 2.483239510582945],
        [7.0, -0.001, 0.002, 0.008749650005249975, 0.00013999580004200011, 4.3745450110249],
        [0.5, 0.3, 0.7, 0.13628384958024845, 2.8897586933128716, 1.0218636588920027],
        [0.5, -12.25, 40.5, 0.3507909647666234, 2.714663845537628, 0.9665023137423703],
        [0.5, 1031.7, -2048.125, -0.6203647403816758, 0.005281467381468949, -1.0475090305895574],
        [0.5, -0.001, 0.002, -0.004374825002624988, -4.3748950005250045, -4.374685006824942],
    ];

    #[test]
    fn matches_the_ts_noise() {
        for [seed, x, y, value, dx, dy] in REFERENCE {
            let simplex = Simplex::new(seed);
            assert!((simplex.noise(x, y) - value).abs() < 1e-12);
            let (n, gx, gy) = simplex.noise_with_gradient(x, y);
            assert!((n - value).abs() < 1e-12);
            assert!((gx - dx).abs() < 1e-9);
            assert!((gy - dy).abs() < 1e-9);
        }
    }

    #[test]
    fn pairs_match_single_points_exactly() {
        for seed in [1234.0, 7.0, 0.5] {
            let simplex = Simplex::new(seed);
            for k in 0..5000 {
                let (ax, ay) = (k as f64 * 0.731 - 900.0, k as f64 * -0.413 + 37.0);
                let (bx, by) = (ax * -1.7 + 0.25, ay + 1024.125);
                let pair = simplex.noise2(F64x2::new(ax, bx), F64x2::new(ay, by));
                assert_eq!(pair, [simplex.noise(ax, ay), simplex.noise(bx, by)]);

                let (n, dx, dy) = simplex.noise_with_gradient2(F64x2::new(ax, bx), F64x2::new(ay, by));
                for (lane, (x, y)) in [(ax, ay), (bx, by)].into_iter().enumerate() {
                    assert_eq!((n[lane], dx[lane], dy[lane]), simplex.noise_with_gradient(x, y));
                }
            }
        }
    }

    #[test]
    fn stays_in_range() {
        let simplex = Simplex::new(42.0);
        for k in 0..10000 {
            let v = simplex.noise(k as f64 * 0.137, k as f64 * -0.071);
            assert!((-1.0..=1.0).contains(&v));
        }
    }
}
