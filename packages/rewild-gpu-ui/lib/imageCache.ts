/**
 * The unused images, by key, with their bytes, oldest first. An image that
 * no node or owner holds waits here, so it is ready if it is used again.
 * When the bytes go over the limit, the oldest images go first.
 */
export class UnusedImages {
  /** Key to bytes. A `Map` keeps the order that keys were added in. */
  private entries = new Map<string, number>();
  private _bytes = 0;

  get bytes(): number {
    return this._bytes;
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Adds an image that is no longer used, as the newest. */
  add(key: string, bytes: number): void {
    this.remove(key);
    this.entries.set(key, bytes);
    this._bytes += bytes;
  }

  /** Takes an image out, because it is used again or freed. Returns false when it was not here. */
  remove(key: string): boolean {
    const bytes = this.entries.get(key);
    if (bytes === undefined) return false;
    this.entries.delete(key);
    this._bytes -= bytes;
    return true;
  }

  /**
   * Takes out the oldest images until the bytes are at most `limit`, and
   * returns their keys, to free.
   */
  trim(limit: number): string[] {
    const freed: string[] = [];
    for (const [key, bytes] of this.entries) {
      if (this._bytes <= limit) break;
      this.entries.delete(key);
      this._bytes -= bytes;
      freed.push(key);
    }
    return freed;
  }
}
