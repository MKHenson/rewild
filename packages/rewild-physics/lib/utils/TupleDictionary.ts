const getKey = (i: i32, j: i32): string => (i < j ? `${i}-${j}` : `${j}-${i}`);

/**
 * TupleDictionary
 */
export class TupleDictionary<T> {
  data: Map<string, T>;

  constructor() {
    this.data = new Map();
  }

  /** get */
  get(i: i32, j: i32): T | null {
    const key: string = getKey(i, j);
    if (this.data.has(key) == false) {
      return null;
    }
    return this.data.get(key) as T;
  }

  /** set */
  set(i: i32, j: i32, value: T): void {
    const key = getKey(i, j);

    // // Check if key already exists
    // if (!this.get(i, j)) {
    //   this.data.keys.push(key);
    // }

    this.data.set(key, value);
  }

  /** delete */
  delete(i: i32, j: i32): void {
    const key = getKey(i, j);
    // const index = this.data.keys.indexOf(key);
    // if (index !== -1) {
    //   this.data.keys.splice(index, 1);
    // }
    this.data.delete(key);
  }

  /** reset */
  reset(): void {
    this.data.clear();
  }
}
