export class TupleDictionary<T> {
  data: { keys: f32[] };
  /**
   * @class TupleDictionary
   * @constructor
   */
  constructor() {
    /**
     * The data storage
     * @property data
     * @type {Object}
     */
    this.data = { keys: [] };
  }

  /**
   * @method get
   * @param  {Number} i
   * @param  {Number} j
   * @return {Number}
   */
  get(i: i32, j: i32): T {
    if (i > j) {
      // swap
      const temp = j;
      j = i;
      i = temp;
    }
    return this.data[i + "-" + j];
  }

  /**
   * @method set
   * @param  {Number} i
   * @param  {Number} j
   * @param {Number} value
   */
  set(i: i32, j: i32, value: T): void {
    if (i > j) {
      const temp = j;
      j = i;
      i = temp;
    }
    const key = i + "-" + j;

    // Check if key already exists
    if (!this.get(i, j)) {
      this.data.keys.push(key);
    }

    this.data[key] = value;
  }

  /**
   * @method reset
   */
  reset(): void {
    const data = this.data,
      keys = data.keys;

    while (keys.length > 0) {
      const key = keys.pop();
      delete data[key];
    }
  }
}
