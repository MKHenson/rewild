export abstract class Pool<T> {
  static idCounter: i32 = 0;
  objects: Array<T>;

  /**
   * For pooling objects that can be reused.
   * @class Pool
   * @constructor
   */
  constructor() {
    /**
     * The pooled objects
     * @property {Array} objects
     */
    this.objects = [];
  }

  /**
   * Release an object after use
   * @method release
   * @param {Object} obj
   */
  release(toRelease: T[]): Pool<T> {
    var Nargs = toRelease.length;
    for (var i = 0; i != Nargs; i++) {
      this.objects.push(toRelease[i]);
    }
    return this;
  }

  releaseOne(toRelease: T): Pool<T> {
    this.objects.push(toRelease);
    return this;
  }

  /**
   * Get an object
   * @method get
   * @return {mixed}
   */
  get(): T {
    if (this.objects.length === 0) {
      return this.constructObject();
    } else {
      return this.objects.pop()!;
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
    var objects = this.objects;

    while (objects.length > size) {
      objects.pop();
    }

    while (objects.length < size) {
      objects.push(this.constructObject());
    }

    return this;
  }
}
