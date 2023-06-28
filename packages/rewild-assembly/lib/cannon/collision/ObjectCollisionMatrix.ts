export class ObjectCollisionMatrix {
  matrix: Map<string, boolean>;

  /**
   * Records what objects are colliding with each other
   * @class ObjectCollisionMatrix
   * @constructor
   */
  constructor() {
    this.matrix = new Map();
  }

  /**
   * @method get
   * @param  {Number} i
   * @param  {Number} j
   * @return {Number}
   */
  get(i: i32, j: i32): bool {
    i = i.id;
    j = j.id;
    if (j > i) {
      var temp = j;
      j = i;
      i = temp;
    }
    return this.matrix.has(i.toString() + "-" + j.toString()); // i + "-" + j in this.matrix;
  }

  /**
   * @method set
   * @param  {Number} i
   * @param  {Number} j
   * @param {Number} value
   */
  set(i: i32, j: i32, value: f32): void {
    i = i.id;
    j = j.id;
    if (j > i) {
      let temp: i32 = j;
      j = i;
      i = temp;
    }
    if (value) {
      this.matrix.set(i.toString() + "-" + j.toString(), true);
    } else {
      this.matrix.delete(i.toString() + "-" + j.toString());
    }
  }

  /**
   * Empty the matrix
   * @method reset
   */
  reset(): void {
    this.matrix.clear();
  }

  /**
   * Set max number of objects
   * @method setNumObjects
   * @param {Number} n
   */
  setNumObjects(n: i32): void {}
}
