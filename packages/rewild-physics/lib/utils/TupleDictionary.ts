export class TupleDictionary<T> {
  data: Map<string, T>;
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
    this.data = new Map();
  }

  /**
   * @method get
   * @param  {Number} i
   * @param  {Number} j
   * @return {Number}
   */
  get(i: i32, j: i32): T | null {
    if (i > j) {
      // swap
      const temp = j;
      j = i;
      i = temp;
    }

    const keyStr = i.toString() + "-" + j.toString();
    if (this.data.has(keyStr) == false) {
      return null;
    }
    return this.data.get(keyStr) as T;
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
    const key = i.toString() + "-" + j.toString();
    this.data.set(key, value);
  }

  /**
   * @method reset
   */
  reset(): void {
    this.data.clear();
  }
}
