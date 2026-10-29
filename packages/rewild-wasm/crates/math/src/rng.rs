//! The Park–Miller generator seeded fields derive their offsets from.
//! Mirrors `seededRandom` in the TS terrain code, so a seed picks the same
//! stream on both sides.

pub struct ParkMiller(f64);

impl ParkMiller {
    pub fn new(seed: f64) -> Self {
        let mut value = seed % 2147483647.0;
        if value <= 0.0 {
            value += 2147483646.0;
        }
        Self(value)
    }

    /// The next value in 0..1.
    pub fn next(&mut self) -> f64 {
        self.0 = (self.0 * 16807.0) % 2147483647.0;
        (self.0 - 1.0) / 2147483646.0
    }

    /// A field offset in -100000..100000, which decorrelates fields that share
    /// one noise basis.
    pub fn offset(&mut self) -> f64 {
        self.next() * 200000.0 - 100000.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_ts_stream() {
        // seededRandom(1234) in the TS terrain code.
        let mut rng = ParkMiller::new(1234.0);
        assert_eq!(rng.next(), 0.009657739204967151);
        assert_eq!(rng.next(), 0.3176305683493899);
    }

    #[test]
    fn maps_non_positive_seeds_into_range() {
        let mut rng = ParkMiller::new(0.0);
        let v = rng.next();
        assert!((0.0..1.0).contains(&v));
    }
}
