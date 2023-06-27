export abstract class Pool {
  static idCounter: i32 = 0;
  objects: Array<any>;
  type: any;

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

    /**
     * Constructor of the objects
     * @property {mixed} type
     */
    this.type = Object;
  }

  /**
   * Release an object after use
   * @method release
   * @param {Object} obj
   */
  release(): Pool {
    var Nargs = arguments.length;
    for (var i = 0; i !== Nargs; i++) {
      this.objects.push(arguments[i]);
    }
    return this;
  }

  /**
   * Get an object
   * @method get
   * @return {mixed}
   */
  get(): void {
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
  abstract constructObject(): void;

  /**
   * @method resize
   * @param {number} size
   * @return {Pool} Self, for chaining
   */
  resize(size: i32): Pool {
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
