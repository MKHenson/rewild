import { Body } from "../objects/Body";

export class ArrayCollisionMatrix {
  matrix: i32[];

  /**
   * Collision "matrix". It's actually a triangular-shaped array of whether two bodies are touching this step, for reference next step
   * @class ArrayCollisionMatrix
   * @constructor
   */
  constructor() {
    /**
     * The matrix storage
     * @property matrix
     * @type {Array}
     */
    this.matrix = [];
  }

  /**
   * Get an element
   * @method get
   */
  get(bi: Body, bj: Body): i32 {
    let i = bi.index;
    let j = bj.index;
    if (j > i) {
      const temp = j;
      j = i;
      i = temp;
    }
    return this.matrix[((i * (i + 1)) >> 1) + j - 1];
  }

  /**
   * Set an element
   * @method set
   * @param {Number} value
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
   * @method reset
   */
  reset(): void {
    for (let i: i32 = 0, l: i32 = this.matrix.length; i != l; i++) {
      this.matrix[i] = 0;
    }
  }

  /**
   * Sets the max number of objects
   * @method setNumObjects
   * @param {Number} n
   */
  setNumObjects(n: i32): void {
    this.matrix.length = (n * (n - 1)) >> 1;
  }
}
