import { WeatherRange } from './WeatherTypes';

/** Seeded mulberry32: the same seed gives the same sequence. */
export class WeatherRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** 0 inclusive to 1 exclusive. */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  between(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  in(range: WeatherRange): number {
    return this.between(range.min, range.max);
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}
