//! Integer hashes for seeded randomness that needs no generator state. Mirrors
//! `rewild-common/math/Hash.ts`, so a seed picks the same cells on both sides.

/// Scrambles a 32-bit value so every input bit affects every output bit.
pub fn mix_hash(h: u32) -> u32 {
    let h = (h ^ (h >> 16)).wrapping_mul(0x85eb_ca6b);
    let h = (h ^ (h >> 13)).wrapping_mul(0xc2b2_ae35);
    h ^ (h >> 16)
}

/// A hash of integer grid cell (x, y) under `seed`.
pub fn hash_cell(x: i32, y: i32, seed: i32) -> u32 {
    let h = (x as u32).wrapping_mul(0x9e37_79b1);
    let h = (h ^ y as u32).wrapping_mul(0x85eb_ca6b);
    mix_hash(h ^ seed as u32)
}

/// The `index`-th independent value in 0..1 derived from `hash`.
pub fn hash01(hash: u32, index: u32) -> f64 {
    mix_hash(hash.wrapping_add(index.wrapping_mul(0x9e37_79b1))) as f64 / 4294967296.0
}

/// A number truncated and wrapped to 32 bits, as JS `value | 0`.
pub fn to_int32(value: f64) -> i32 {
    if !value.is_finite() {
        return 0;
    }
    value.trunc().rem_euclid(4294967296.0) as u32 as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_ts_hashes() {
        // hashCell(3, -7, 1234) and hash01 of it in Hash.ts.
        let h = hash_cell(3, -7, 1234);
        assert_eq!(h, 902111584);
        assert_eq!(hash01(h, 0), 0.8511919383890927);
        assert_eq!(hash01(h, 5), 0.8216432449407876);
        // A hash past i32::MAX wraps the add, as the TS `|` does.
        assert_eq!(hash01(4000000000, 7), 0.9846696571912616);
    }

    #[test]
    fn wraps_like_js() {
        assert_eq!(to_int32(-1.5), -1);
        assert_eq!(to_int32(4294967297.0), 1);
        assert_eq!(to_int32(2147483648.0), -2147483648);
    }
}
