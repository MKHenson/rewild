export class RandomNumberGenerator {
  private seed: u32;

  constructor(seed: u32) {
    this.seed = seed;
  }

  // LCG values reference: Numerical Recipes
  private LCG_A: u32 = 1664525;
  private LCG_C: u32 = 1013904223;

  public next(min: u32, max: u32): u32 {
    // Linear congruential generator formula: (seed * a + c) % m
    // As we're using u32, the modulo operation is implicit
    this.seed = this.LCG_A * this.seed + this.LCG_C;
    // normalize the result to be within the desired range
    return min + (this.seed % (max - min + 1));
  }
}
