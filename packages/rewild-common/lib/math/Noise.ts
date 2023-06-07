export interface INoise {
  get2D(xin: f32, yin: f32): f32;
}

export * from "./NoisePerlin";
export * from "./NoiseSimplex";
