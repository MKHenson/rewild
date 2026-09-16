/**
 * Fixed-size rolling window of samples.
 *
 *     const s = new Stat(120);
 *     s.push(16.7);
 *     s.avg; // 16.7
 *
 * A window rather than a running average because the numbers this holds spike.
 * A pass that costs 9 ms on one frame in two averages to 4.6, and only `max`
 * shows the 9.
 */
export class Stat {
  private readonly values: Float64Array;
  private cursor = 0;
  private filled = 0;

  constructor(readonly capacity: number = 120) {
    this.values = new Float64Array(capacity);
  }

  push(value: number): void {
    this.values[this.cursor] = value;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  /** Number of samples currently held, up to `capacity`. */
  get count(): number {
    return this.filled;
  }

  get last(): number {
    if (this.filled === 0) return 0;
    return this.values[(this.cursor + this.capacity - 1) % this.capacity];
  }

  get avg(): number {
    if (this.filled === 0) return 0;
    let total = 0;
    for (let i = 0; i < this.filled; i++) total += this.values[i];
    return total / this.filled;
  }

  get max(): number {
    if (this.filled === 0) return 0;
    let highest = -Infinity;
    for (let i = 0; i < this.filled; i++) {
      if (this.values[i] > highest) highest = this.values[i];
    }
    return highest;
  }

  reset(): void {
    this.cursor = 0;
    this.filled = 0;
  }
}
