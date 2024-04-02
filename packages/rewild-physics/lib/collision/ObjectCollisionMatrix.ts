import { Body } from '../objects/Body';

/**
 * Records what objects are colliding with each other
 */
export class ObjectCollisionMatrix {
  /**
   * The matrix storage.
   */
  matrix: Map<string, boolean>;

  /**
   * @todo Remove useless constructor
   */
  constructor() {
    this.matrix = new Map();
  }

  /**
   * get
   */
  get(bi: Body, bj: Body): boolean {
    let i = bi.id;
    let j = bj.id;
    if (j > i) {
      const temp = j;
      j = i;
      i = temp;
    }
    return this.matrix.has(`${i}-${j}`);
  }

  /**
   * set
   */
  set(bi: Body, bj: Body, value: boolean): void {
    let i = bi.id;
    let j = bj.id;
    if (j > i) {
      const temp = j;
      j = i;
      i = temp;
    }
    if (value) {
      this.matrix.set(`${i}-${j}`, true);
    } else {
      this.matrix.delete(`${i}-${j}`);
    }
  }

  /**
   * Empty the matrix
   */
  reset(): void {
    this.matrix.clear();
  }

  /**
   * Set max number of objects
   */
  setNumObjects(n: i32): void {}
}
