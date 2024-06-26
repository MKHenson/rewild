import { Body } from '../objects/Body';

/**
 * Collision "matrix".
 * It's actually a triangular-shaped array of whether two bodies are touching this step, for reference next step
 */
export class ArrayCollisionMatrix {
  /**
   * The matrix storage.
   */
  matrix: i32[];

  constructor() {
    this.matrix = [];
  }

  /**
   * Get an element
   */
  get(bi: Body, bj: Body): i32 {
    let i = bi.index;
    let j = bj.index;
    if (j > i) {
      const temp = j;
      j = i;
      i = temp;
    }
    // return this.matrix[((i * (i + 1)) >> 1) + j - 1];
    const index = ((i * (i + 1)) >> 1) + j - 1;
    if (this.matrix.length <= index) return 0;
    return 1;
  }

  /**
   * Set an element
   */
  set(bi: Body, bj: Body, value: boolean): void {
    let i = bi.index;
    let j = bj.index;
    if (j > i) {
      const temp = j;
      j = i;
      i = temp;
    }
    this.matrix[((i * (i + 1)) >> 1) + j - 1] = value ? 1 : 0;
  }

  /**
   * Sets all elements to zero
   */
  reset(): void {
    for (let i: i32 = 0, l = this.matrix.length; i != l; i++) {
      this.matrix[i] = 0;
    }
  }

  /**
   * Sets the max number of objects
   */
  setNumObjects(n: i32): void {
    this.matrix.length = (n * (n - 1)) >> 1;
  }
}
