//! Brush edits to LOD-0 heights: sculpt stamps and the water brush's bed, lip
//! and bank. See `Sculpt.ts` and `WaterCarve.ts`.
//!
//! An edit works on a patch, a box of world samples the caller gathers from
//! every chunk that owns them. Chunk (cx, cy) owns world sample (wx, wz) when
//! |wx - cx·span| <= span/2 and |wz - cy·span| <= span/2, so an edge sample
//! has two owners and a corner four. A sample changes only when every owner is
//! loaded, and the caller writes it back to each of them, so shared edges stay
//! equal.

use math::{ease_out, fast_max, fast_min, smoothstep};

/// A loaded owner supplied the sample.
pub const READABLE: u8 = 1;
/// An owner of the sample is not loaded, so it must not change.
pub const MISSING: u8 = 2;

/// LOD-0 heights over a box of world samples, row by row from (`x0`, `z0`),
/// +x along a row and +z down the rows.
pub struct Patch<'a> {
    pub heights: &'a mut [f32],
    /// `READABLE` and `MISSING` bits per sample.
    pub flags: &'a [u8],
    pub x0: i32,
    pub z0: i32,
    pub width: usize,
    /// Samples a chunk spans, its size minus one. Even.
    pub span: i32,
    pub meters_per_sample: f64,
}

impl Patch<'_> {
    fn height(&self) -> usize {
        self.heights.len().checked_div(self.width).unwrap_or(0)
    }

    /// Sets each editable sample to `edit(wx, wz, index, height)` and marks
    /// the chunks it changes.
    fn edit(&mut self, mut edit: impl FnMut(i32, i32, usize, f64) -> f64) -> Touched {
        let mut touched = Touched::new(self);
        for r in 0..self.height() {
            let wz = self.z0 + r as i32;
            for c in 0..self.width {
                let i = r * self.width + c;
                if self.flags[i] != READABLE {
                    continue;
                }
                let wx = self.x0 + c as i32;
                let v = self.heights[i] as f64;
                let next = edit(wx, wz, i, v);
                if next != v {
                    self.heights[i] = next as f32;
                    touched.mark(wx, wz);
                }
            }
        }
        touched
    }
}

fn floor_div(a: i32, b: i32) -> i32 {
    a.div_euclid(b)
}

fn ceil_div(a: i32, b: i32) -> i32 {
    -(-a).div_euclid(b)
}

/// The chunks an edit changed.
pub struct Touched {
    span: i32,
    cx0: i32,
    cy0: i32,
    columns: usize,
    marks: Vec<bool>,
}

impl Touched {
    fn new(patch: &Patch) -> Touched {
        let (span, half) = (patch.span, patch.span / 2);
        let cx0 = ceil_div(patch.x0 - half, span);
        let cy0 = ceil_div(patch.z0 - half, span);
        let cx1 = floor_div(patch.x0 + patch.width as i32 - 1 + half, span);
        let cy1 = floor_div(patch.z0 + patch.height() as i32 - 1 + half, span);
        let columns = (cx1 - cx0 + 1).max(0) as usize;
        let rows = (cy1 - cy0 + 1).max(0) as usize;
        Touched { span, cx0, cy0, columns, marks: vec![false; columns * rows] }
    }

    fn mark(&mut self, wx: i32, wz: i32) {
        let half = self.span / 2;
        for cy in ceil_div(wz - half, self.span)..=floor_div(wz + half, self.span) {
            for cx in ceil_div(wx - half, self.span)..=floor_div(wx + half, self.span) {
                let i = (cy - self.cy0) as usize * self.columns + (cx - self.cx0) as usize;
                self.marks[i] = true;
            }
        }
    }

    /// (cx, cy) of each changed chunk, row by row.
    pub fn chunks(&self) -> Vec<i32> {
        let mut chunks = Vec::new();
        for (i, _) in self.marks.iter().enumerate().filter(|(_, &m)| m) {
            chunks.push(self.cx0 + (i % self.columns) as i32);
            chunks.push(self.cy0 + (i / self.columns) as i32);
        }
        chunks
    }
}

/// Values over a box of world texels, row by row from (`i0`, `j0`), one texel
/// every `step` samples.
pub struct TexelGrid<'a, T> {
    pub values: &'a [T],
    pub i0: i32,
    pub j0: i32,
    pub width: usize,
    pub step: i32,
}

impl<T: Copy> TexelGrid<'_, T> {
    /// The texel nearest world sample (wx, wz), rounding halves up as
    /// `Math.round` does.
    fn texel(&self, wx: i32, wz: i32) -> (i32, i32) {
        let step = self.step as f64;
        ((wx as f64 / step + 0.5).floor() as i32, (wz as f64 / step + 0.5).floor() as i32)
    }

    fn index(&self, i: i32, j: i32) -> Option<usize> {
        let (x, y) = (i - self.i0, j - self.j0);
        let height = self.values.len().checked_div(self.width).unwrap_or(0);
        if x < 0 || y < 0 || x as usize >= self.width || y as usize >= height {
            return None;
        }
        Some(y as usize * self.width + x as usize)
    }

    fn at(&self, i: i32, j: i32) -> Option<T> {
        self.index(i, j).map(|g| self.values[g])
    }
}

/// The water brush's shore, in metres past the shoreline. Mirrors the
/// constants in `WaterCarve.ts`.
pub struct Shore {
    /// Where the lip reaches its top.
    pub rise: f64,
    /// Where the lip starts to ease back to the ground.
    pub crest: f64,
    /// Where the shore apron ends.
    pub reach: f64,
}

impl Shore {
    /// The shore of water map texels `texel` metres wide.
    pub fn new(texel: f64) -> Shore {
        Shore { rise: texel * 0.75, crest: texel * 1.5 + texel * std::f64::consts::SQRT_2, reach: texel * 5.0 }
    }

    /// A lip `out` metres from its shoreline: from `level` up to
    /// `level + height` by `rise`, steeply at first, held to `crest`, then
    /// easing to `ground` by `reach`.
    fn lip(&self, out: f64, level: f64, height: f64, ground: f64) -> f64 {
        let top = level + height;
        if out < self.rise {
            return level + height * ease_out(out, 0.0, self.rise);
        }
        if out < self.crest {
            return top;
        }
        top + (ground - top) * smoothstep(out, self.crest, self.reach)
    }
}

// 1 at the centre, 0 at the radius.
fn falloff(dist: f64, radius: f64) -> f64 {
    let t = dist / radius;
    1.0 - t * t * (3.0 - 2.0 * t)
}

fn unit_clamp(x: f64) -> f64 {
    fast_min(1.0, fast_max(0.0, x))
}

pub enum Brush {
    Raise,
    Lower,
    /// Toward the box average of the (2·kernel + 1)² samples around.
    Smooth { kernel: usize },
    /// Toward a world height.
    Flatten { target: f64 },
    /// Toward the generated heights.
    Reset,
}

/// One sculpt stamp. See `SculptStamp` in `Sculpt.ts`.
pub struct SculptStamp {
    pub brush: Brush,
    /// Brush centre in world metres.
    pub centre_x: f64,
    pub centre_z: f64,
    /// Brush radius in world metres.
    pub radius: f64,
    pub amount: f64,
}

/// Sums and counts of the readable samples of a patch, summed from its first
/// corner, so any box average costs four reads.
struct BoxSums {
    width: usize,
    height: usize,
    sums: Vec<f64>,
    counts: Vec<u32>,
}

impl BoxSums {
    fn new(patch: &Patch) -> BoxSums {
        let (width, height) = (patch.width, patch.height());
        let stride = width + 1;
        let mut sums = vec![0.0; stride * (height + 1)];
        let mut counts = vec![0; stride * (height + 1)];
        for r in 0..height {
            let (mut sum, mut count) = (0.0, 0);
            for c in 0..width {
                let i = r * width + c;
                if patch.flags[i] & READABLE != 0 {
                    sum += patch.heights[i] as f64;
                    count += 1;
                }
                let t = (r + 1) * stride + c + 1;
                sums[t] = sums[t - stride] + sum;
                counts[t] = counts[t - stride] + count;
            }
        }
        BoxSums { width, height, sums, counts }
    }

    /// The average of the readable samples within `kernel` of (r, c).
    fn average(&self, r: usize, c: usize, kernel: usize) -> f64 {
        let stride = self.width + 1;
        let (r0, r1) = (r.saturating_sub(kernel), (r + kernel + 1).min(self.height));
        let (c0, c1) = (c.saturating_sub(kernel), (c + kernel + 1).min(self.width));
        let corner = |r: usize, c: usize| r * stride + c;
        let (a, b, d, e) = (corner(r0, c0), corner(r0, c1), corner(r1, c0), corner(r1, c1));
        let sum = self.sums[e] - self.sums[b] - self.sums[d] + self.sums[a];
        let count = self.counts[e] + self.counts[a] - self.counts[b] - self.counts[d];
        sum / count as f64
    }
}

/// Applies a sculpt stamp to the samples within its radius. `baseline` holds
/// the generated heights over the patch, NaN where they are not known, and is
/// read by `Reset` alone. A smooth stamp averages the heights as they stood
/// before it, so the patch needs `kernel` samples beyond the radius.
pub fn sculpt(patch: &mut Patch, stamp: &SculptStamp, baseline: &[f32]) -> Touched {
    let mps = patch.meters_per_sample;
    let (centre_x, centre_z, radius) = (stamp.centre_x / mps, stamp.centre_z / mps, stamp.radius / mps);
    if radius <= 0.0 || stamp.amount == 0.0 {
        return Touched::new(patch);
    }
    let sums = matches!(stamp.brush, Brush::Smooth { .. }).then(|| BoxSums::new(patch));
    let (x0, z0, amount) = (patch.x0, patch.z0, stamp.amount);
    let radius_sq = radius * radius;
    patch.edit(|wx, wz, i, v| {
        let dx = wx as f64 - centre_x;
        let dz = wz as f64 - centre_z;
        let dist_sq = dx * dx + dz * dz;
        if dist_sq > radius_sq {
            return v;
        }
        let f = falloff(dist_sq.sqrt(), radius);
        match stamp.brush {
            Brush::Raise => v + amount * f,
            Brush::Lower => v - amount * f,
            Brush::Flatten { target } => v + (target - v) * unit_clamp(amount * f),
            Brush::Reset => {
                let generated = baseline[i] as f64;
                if generated.is_nan() {
                    return v;
                }
                v + (generated - v) * unit_clamp(amount * f)
            }
            Brush::Smooth { kernel } => {
                let sums = sums.as_ref().unwrap();
                let average = sums.average((wz - z0) as usize, (wx - x0) as usize, kernel.max(1));
                v + (average - v) * unit_clamp(amount * f)
            }
        }
    })
}

/// One water brush stamp's bed. See `CarveStamp` in `WaterCarve.ts`.
pub struct Carve {
    /// Brush centre in world metres.
    pub centre_x: f64,
    pub centre_z: f64,
    /// The water's shoreline, in metres from the centre.
    pub radius: f64,
    /// World height of the water's surface.
    pub level: f64,
    /// Metres the bed lies below the level at the centre.
    pub depth: f64,
    /// Fraction of the way the ground moves to the bed.
    pub blend: f64,
}

/// Digs the ground toward the stroke's bed. See `applyCarveStamp` in
/// `WaterCarve.ts`. `guard` is nonzero over texels the stroke leaves alone,
/// and every texel outside it is left alone too. `originals` holds the ground
/// as the stroke found it, NaN where it is not known. `targets` holds the
/// stroke's bed, which this stamp lowers to its own shape, NaN where the
/// stroke keeps none.
pub fn carve(
    patch: &mut Patch,
    carve: &Carve,
    guard: &TexelGrid<u8>,
    originals: &[f32],
    targets: &mut [f32],
    shore: &Shore,
) -> Touched {
    let blend = fast_min(1.0, carve.blend);
    if carve.radius <= 0.0 || blend <= 0.0 {
        return Touched::new(patch);
    }
    let mps = patch.meters_per_sample;
    let (centre_x, centre_z) = (carve.centre_x / mps, carve.centre_z / mps);
    let (radius, level, depth) = (carve.radius, carve.level, carve.depth);
    let reach = radius + shore.reach;
    patch.edit(|wx, wz, i, v| {
        let dx = wx as f64 - centre_x;
        let dz = wz as f64 - centre_z;
        let d = (dx * dx + dz * dz).sqrt() * mps;
        if d >= reach {
            return v;
        }
        let (ti, tj) = guard.texel(wx, wz);
        if guard.at(ti, tj).is_none_or(|blocked| blocked != 0) {
            return v;
        }
        let shape = if d < radius {
            level - depth * (1.0 - (d / radius) * (d / radius))
        } else {
            let before = originals[i] as f64;
            let ground = if before.is_nan() { v } else { before };
            level + (ground - level) * ease_out(d - radius, 0.0, shore.reach)
        };
        let mut target = shape;
        if !targets[i].is_nan() {
            if shape < targets[i] as f64 {
                targets[i] = shape as f32;
            }
            target = targets[i] as f64;
        }
        if target >= v {
            return v;
        }
        v + (target - v) * blend
    })
}

/// Raises dry ground in an add stroke's shore apron into a lip. See
/// `applyWaterLip` in `WaterCarve.ts`. `discs` are the stroke's stamps as
/// (x, z, radius) triples in metres. `wet` and `own` are the shore grid's
/// planes, and `originals` the ground as the stroke found it, NaN where it is
/// not known.
#[allow(clippy::too_many_arguments)]
pub fn lip(
    patch: &mut Patch,
    discs: &[f64],
    wet: &TexelGrid<u8>,
    own: &TexelGrid<u8>,
    originals: &[f32],
    level: f64,
    height: f64,
    shore: &Shore,
) -> Touched {
    let mps = patch.meters_per_sample;
    patch.edit(|wx, wz, i, v| {
        let (x, z) = (wx as f64 * mps, wz as f64 * mps);
        let mut out = f64::INFINITY;
        for &[cx, cz, r] in discs.as_chunks::<3>().0 {
            let dx = x - cx;
            let dz = z - cz;
            if dx.abs() - r >= out || dz.abs() - r >= out {
                continue;
            }
            let edge = (dx * dx + dz * dz).sqrt() - r;
            if edge < out {
                out = edge;
            }
        }
        if out <= 0.0 || out >= shore.reach {
            return v;
        }
        let (ti, tj) = wet.texel(wx, wz);
        if wet.at(ti, tj) != Some(0) {
            return v;
        }
        let before = originals[i] as f64;
        let ground = if before.is_nan() { v } else { before };
        if own.at(ti, tj) == Some(1) && ground < level {
            return v;
        }
        fast_max(shore.lip(out, level, height, ground), v)
    })
}

// Metres (x, z) lies inside the union of `discs`; negative outside.
fn inside_discs(discs: &[f64], x: f64, z: f64) -> f64 {
    let mut inside = f64::NEG_INFINITY;
    for &[cx, cz, r] in discs.as_chunks::<3>().0 {
        let dx = x - cx;
        let dz = z - cz;
        let depth = r - (dx * dx + dz * dz).sqrt();
        if depth > inside {
            inside = depth;
        }
    }
    inside
}

/// Raises a bank inside a remove stroke's circles where they cut water that
/// stays. See `applyCutBank` in `WaterCarve.ts`. `levels` and `covered` are
/// the cut grid's planes: the surface of water that stays, NaN elsewhere, and
/// whether water covers the texel.
pub fn cut_bank(
    patch: &mut Patch,
    discs: &[f64],
    levels: &TexelGrid<f32>,
    covered: &TexelGrid<u8>,
    height: f64,
    shore: &Shore,
) -> Touched {
    let mps = patch.meters_per_sample;
    let unit = levels.step as f64 * mps;
    let window = (shore.reach / unit).ceil() as i32;
    let reach_sq = shore.reach * shore.reach;
    let rows = levels.values.len().checked_div(levels.width).unwrap_or(0) as i32;
    patch.edit(|wx, wz, _, v| {
        let (x, z) = (wx as f64 * mps, wz as f64 * mps);
        let inside = inside_discs(discs, x, z);
        if inside <= 0.0 || inside >= shore.reach {
            return v;
        }
        let (ti, tj) = levels.texel(wx, wz);
        if covered.at(ti, tj).is_some_and(|c| c != 0) && levels.at(ti, tj).is_some_and(f32::is_nan) {
            return v;
        }

        let mut nearest_sq = f64::INFINITY;
        let mut level = f64::NAN;
        let (i0, i1) = ((ti - window).max(levels.i0), (ti + window).min(levels.i0 + levels.width as i32 - 1));
        let (j0, j1) = ((tj - window).max(levels.j0), (tj + window).min(levels.j0 + rows - 1));
        for j in j0..=j1 {
            let dz = j as f64 * unit - z;
            let row = (j - levels.j0) as usize * levels.width;
            for i in i0..=i1 {
                let surface = levels.values[row + (i - levels.i0) as usize];
                if surface.is_nan() {
                    continue;
                }
                let dx = i as f64 * unit - x;
                let d_sq = dx * dx + dz * dz;
                if d_sq < nearest_sq {
                    nearest_sq = d_sq;
                    level = surface as f64;
                }
            }
        }
        if nearest_sq >= reach_sq {
            return v;
        }

        let bank = shore.lip(inside, level, height, v);
        let target = v + (bank - v) * (1.0 - smoothstep(nearest_sq.sqrt(), shore.crest, shore.reach));
        fast_max(target, v)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPAN: i32 = 4;

    /// A patch over world samples (x0, z0)–(x0 + width - 1, z0 + height - 1),
    /// all readable, heights from `fill`.
    struct Fixture {
        heights: Vec<f32>,
        flags: Vec<u8>,
        x0: i32,
        z0: i32,
        width: usize,
    }

    impl Fixture {
        fn new(x0: i32, z0: i32, width: usize, height: usize, fill: impl Fn(i32, i32) -> f32) -> Fixture {
            let mut heights = Vec::with_capacity(width * height);
            for r in 0..height as i32 {
                for c in 0..width as i32 {
                    heights.push(fill(x0 + c, z0 + r));
                }
            }
            Fixture { heights, flags: vec![READABLE; width * height], x0, z0, width }
        }

        fn patch(&mut self) -> Patch<'_> {
            Patch {
                heights: &mut self.heights,
                flags: &self.flags,
                x0: self.x0,
                z0: self.z0,
                width: self.width,
                span: SPAN,
                meters_per_sample: 1.0,
            }
        }

        fn at(&self, wx: i32, wz: i32) -> f32 {
            self.heights[(wz - self.z0) as usize * self.width + (wx - self.x0) as usize]
        }
    }

    fn stamp(brush: Brush, radius: f64) -> SculptStamp {
        SculptStamp { brush, centre_x: 0.0, centre_z: 0.0, radius, amount: 1.0 }
    }

    #[test]
    fn raise_falls_off_to_the_radius() {
        let mut f = Fixture::new(-2, -2, 5, 5, |_, _| 0.0);
        let nan = vec![f32::NAN; 25];
        sculpt(&mut f.patch(), &stamp(Brush::Raise, 2.0), &nan);
        assert_eq!(f.at(0, 0), 1.0);
        assert_eq!(f.at(2, 0), 0.0);
        assert!(f.at(1, 0) > 0.0 && f.at(1, 0) < 1.0);
        assert_eq!(f.at(1, 0), f.at(0, 1));
    }

    #[test]
    fn touched_lists_every_owner_of_a_changed_sample() {
        // Sample (2, 0) lies on the edge between chunks (0, 0) and (1, 0).
        let mut f = Fixture::new(1, -1, 3, 3, |_, _| 0.0);
        let nan = vec![f32::NAN; 9];
        let mut s = stamp(Brush::Raise, 0.5);
        s.centre_x = 2.0;
        let touched = sculpt(&mut f.patch(), &s, &nan);
        assert_eq!(touched.chunks(), vec![0, 0, 1, 0]);
    }

    #[test]
    fn missing_owners_keep_the_sample() {
        let mut f = Fixture::new(-2, -2, 5, 5, |_, _| 0.0);
        f.flags[12] = READABLE | MISSING;
        let nan = vec![f32::NAN; 25];
        sculpt(&mut f.patch(), &stamp(Brush::Raise, 2.0), &nan);
        assert_eq!(f.at(0, 0), 0.0);
        assert!(f.at(1, 0) > 0.0);
    }

    #[test]
    fn smooth_averages_the_heights_before_the_stamp() {
        // A spike at the centre spreads over its neighbours.
        let mut f = Fixture::new(-3, -3, 7, 7, |x, z| if x == 0 && z == 0 { 9.0 } else { 0.0 });
        let nan = vec![f32::NAN; 49];
        sculpt(&mut f.patch(), &stamp(Brush::Smooth { kernel: 1 }, 2.0), &nan);
        assert_eq!(f.at(0, 0), 1.0);
        assert!(f.at(1, 0) > 0.0);
        assert_eq!(f.at(1, 0), f.at(-1, 0));
    }

    #[test]
    fn reset_moves_to_the_baseline_where_known() {
        let mut f = Fixture::new(-2, -2, 5, 5, |_, _| 4.0);
        let mut baseline = vec![1.0; 25];
        baseline[13] = f32::NAN;
        sculpt(&mut f.patch(), &stamp(Brush::Reset, 2.0), &baseline);
        assert_eq!(f.at(0, 0), 1.0);
        assert_eq!(f.at(1, 0), 4.0);
    }

    fn open_guard(blocked: &[u8]) -> TexelGrid<'_, u8> {
        TexelGrid { values: blocked, i0: -5, j0: -5, width: 11, step: 1 }
    }

    #[test]
    fn carve_digs_a_bowl_and_keeps_the_lowest_bed() {
        let mut f = Fixture::new(-5, -5, 11, 11, |_, _| 10.0);
        let blocked = vec![0; 121];
        let originals = vec![f32::NAN; 121];
        let mut targets = vec![f32::INFINITY; 121];
        let shore = Shore::new(1.0);
        let stamp = Carve { centre_x: 0.0, centre_z: 0.0, radius: 3.0, level: 10.0, depth: 3.0, blend: 1.0 };
        carve(&mut f.patch(), &stamp, &open_guard(&blocked), &originals, &mut targets, &shore);
        assert_eq!(f.at(0, 0), 7.0);
        assert_eq!(targets[60], 7.0);

        // A shallower stamp leaves the deeper bed.
        let shallow = Carve { depth: 1.0, ..stamp };
        carve(&mut f.patch(), &shallow, &open_guard(&blocked), &originals, &mut targets, &shore);
        assert_eq!(f.at(0, 0), 7.0);
    }

    #[test]
    fn carve_leaves_blocked_texels() {
        let mut f = Fixture::new(-5, -5, 11, 11, |_, _| 10.0);
        let mut blocked = vec![0; 121];
        blocked[60] = 1;
        let originals = vec![f32::NAN; 121];
        let mut targets = vec![f32::NAN; 121];
        let stamp = Carve { centre_x: 0.0, centre_z: 0.0, radius: 3.0, level: 10.0, depth: 3.0, blend: 1.0 };
        carve(&mut f.patch(), &stamp, &open_guard(&blocked), &originals, &mut targets, &Shore::new(1.0));
        assert_eq!(f.at(0, 0), 10.0);
        assert!(f.at(1, 0) < 10.0);
    }

    #[test]
    fn lip_rises_past_the_shoreline_and_never_lowers() {
        let mut f = Fixture::new(-10, -10, 21, 21, |_, _| 0.0);
        let dry = vec![0; 441];
        let grid = TexelGrid { values: &dry[..], i0: -10, j0: -10, width: 21, step: 1 };
        let originals = vec![f32::NAN; 441];
        let shore = Shore::new(1.0);
        lip(&mut f.patch(), &[0.0, 0.0, 3.0], &grid, &grid, &originals, 0.0, 1.0, &shore);
        assert_eq!(f.at(0, 0), 0.0);
        assert_eq!(f.at(5, 0), 1.0);
        assert!(f.at(4, 0) > 0.0 && f.at(4, 0) <= 1.0);
        assert_eq!(f.at(9, 0), 0.0);
    }

    #[test]
    fn cut_bank_rises_beside_water_that_stays() {
        let mut f = Fixture::new(-10, -10, 21, 21, |_, _| 0.0);
        // Water at level 0 stays west of x = -4.
        let levels: Vec<f32> = (0..441).map(|g| if g % 21 < 6 { 0.0 } else { f32::NAN }).collect();
        let covered: Vec<u8> = levels.iter().map(|l| u8::from(!l.is_nan())).collect();
        let levels = TexelGrid { values: &levels[..], i0: -10, j0: -10, width: 21, step: 1 };
        let covered = TexelGrid { values: &covered[..], i0: -10, j0: -10, width: 21, step: 1 };
        let shore = Shore::new(1.0);
        cut_bank(&mut f.patch(), &[0.0, 0.0, 8.0], &levels, &covered, 1.0, &shore);
        assert!(f.at(-4, 0) > 0.0);
        assert_eq!(f.at(6, 0), 0.0);
        assert!(f.heights.iter().all(|&h| h >= 0.0));
    }
}
