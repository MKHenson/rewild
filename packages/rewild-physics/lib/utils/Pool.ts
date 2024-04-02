/**
 * For pooling objects that can be reused.
 */
export abstract class Pool<T> {
  /**
   * The objects array.
   */
  objects: T[] = [];
  /**
   * The type of the objects.
   */
  // type: any = Object;

  /**
   * Release an object after use
   */
  release(toRelease: T[]): Pool<T> {
    const Nargs = toRelease.length;
    for (let i: i32 = 0; i != Nargs; i++) {
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
   */
  get(): T {
    if (this.objects.length === 0) {
      return this.constructObject();
    } else {
      return this.objects.pop() as T;
    }
  }

  /**
   * Construct an object. Should be implmented in each subclass.
   * @method constructObject
   * @return {mixed}
   */
  abstract constructObject(): T;

  /**
   * @return Self, for chaining
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
