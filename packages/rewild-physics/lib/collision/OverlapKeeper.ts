export class OverlapKeeper {
  current: i32[];
  previous: i32[];

  /**
   * @class OverlapKeeper
   * @constructor
   */
  constructor() {
    this.current = [];
    this.previous = [];
  }

  getKey(i: i32, j: i32): i32 {
    if (j < i) {
      const temp = j;
      j = i;
      i = temp;
    }
    return (i << 16) | j;
  }

  /**
   * @method set
   * @param {Number} i
   * @param {Number} j
   */
  set(i: i32, j: i32): void {
    // Insertion sort. This way the diff will have linear complexity.
    const key = this.getKey(i, j);
    const current = this.current;
    let index: i32 = 0;
    while (key < current.length && key > current[index]) {
      index++;
    }
    if (key < current.length && key == current[index]) {
      return; // Pair was already added
    }
    for (let j: i32 = current.length - 1; j >= index; j--) {
      current[j + 1] = current[j];
    }
    current[index] = key;
  }

  /**
   * @method tick
   */
  tick(): void {
    const tmp = this.current;
    this.current = this.previous;
    this.previous = tmp;
    this.current.length = 0;
  }

  /**
   * @method getDiff
   * @param  {array} additions
   * @param  {array} removals
   */
  getDiff(additions: i32[], removals: i32[]): void {
    const a = this.current;
    const b = this.previous;
    const al = a.length;
    const bl = b.length;

    let j: i32 = 0;
    for (let i: i32 = 0; i < al; i++) {
      let found = false;
      const keyA = a[i];
      while (keyA > b[j]) {
        j++;
      }
      found = keyA === b[j];

      if (!found) {
        unpackAndPush(additions, keyA);
      }
    }
    j = 0;
    for (let i: i32 = 0; i < bl; i++) {
      let found = false;
      const keyB = b[i];
      while (keyB > a[j]) {
        j++;
      }
      found = a[j] === keyB;

      if (!found) {
        unpackAndPush(removals, keyB);
      }
    }
  }
}

function unpackAndPush(array: i32[], key: i32): void {
  array.push((key & 0xffff0000) >> 16);
  array.push(key & 0x0000ffff);
}
