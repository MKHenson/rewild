/**
 * @class TupleDictionary
 * @constructor
 */
export class TupleDictionary {
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
  get(i: i32, j: i32): f32 {
    if (i > j) {
      // swap
      var temp = j;
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
  set(i: i32, j: i32, value: f32): void {
    if (i > j) {
      var temp = j;
      j = i;
      i = temp;
    }
    var key = i + "-" + j;

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
    var data = this.data,
      keys = data.keys;
    while (keys.length > 0) {
      var key = keys.pop();
      delete data[key];
    }
  }
}
