/**
 * For pooling objects that can be reused.
 * @class Pool
 * @constructor
 */
export abstract class Pool<T> {
  /**
   * The pooled objects
   * @property {Array} objects
   */
  objects: T[];

  //   /**
  //    * Constructor of the objects
  //    * @property {mixed} type
  //    */
  //   type = Object;

  constructor() {
    /**
     * The pooled objects
     * @property {Array} objects
     */
    this.objects = [];

    // /**
    //  * Constructor of the objects
    //  * @property {mixed} type
    //  */
    // this.type = Object;
  }

  /**
   * Release an object after use
   */
  release(args: T[]): Pool<T> {
    const Nargs = args.length;
    for (let i: i32 = 0; i !== Nargs; i++) {
      this.objects.push(args[i]);
    }
    return this;
  }

  /**
   * Get an object
   */
  get(): T {
    if (this.objects.length === 0) {
      return this.constructObject();
    } else {
      return this.objects.pop();
    }
  }

  /**
   * Construct an object. Should be implmented in each subclass.
   * @method constructObject
   * @return {mixed}
   */
  abstract constructObject(): T;

  /**
   * @method resize
   * @param {number} size
   * @return {Pool} Self, for chaining
   */
  resize(size: i32): Pool<T> {
    const objects = this.objects;

    while (objects.length > size) {
      objects.pop();
    }

    while (objects.length < size) {
      objects.push(this.constructObject());
    }

    return this;
  }
}
