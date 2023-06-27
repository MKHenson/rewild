export class ObjectCollisionMatrix {
  /**
   * Records what objects are colliding with each other
   * @class ObjectCollisionMatrix
   * @constructor
   */
  constructor() {
    /**
     * The matrix storage
     * @property matrix
     * @type {Object}
     */
    this.matrix = {};
  }

  /**
   * @method get
   * @param  {Number} i
   * @param  {Number} j
   * @return {Number}
   */
  get(i: i32, j: i32): void {
    i = i.id;
    j = j.id;
    if (j > i) {
      var temp = j;
      j = i;
      i = temp;
    }
    return i + "-" + j in this.matrix;
  }

  /**
   * @method set
   * @param  {Number} i
   * @param  {Number} j
   * @param {Number} value
   */
  set(i, j, value: f32): void {
    i = i.id;
    j = j.id;
    if (j > i) {
      let temp: i32 = j;
      j = i;
      i = temp;
    }
    if (value) {
      this.matrix[i + "-" + j] = true;
    } else {
      delete this.matrix[i + "-" + j];
    }
  }

  /**
   * Empty the matrix
   * @method reset
   */
  reset(): void {
    this.matrix = {};
  }

  /**
   * Set max number of objects
   * @method setNumObjects
   * @param {Number} n
   */
  setNumObjects(n: i32): void {}
}
