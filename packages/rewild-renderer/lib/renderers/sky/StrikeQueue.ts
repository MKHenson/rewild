/** One lightning strike, as the queue holds it. */
export interface StrikeRecord {
  /** World position of the strike's top, at the cloud base. */
  x: number;
  y: number;
  z: number;
  /** 0 for the first strike, 1 and 2 for the strikes chained after it. */
  chain: number;
  /** Seconds on the queue's clock when it struck. */
  time: number;
}

/** Seconds, from `performance.now()`. */
const performanceClock = (): number => performance.now() / 1000;

/**
 * A fixed ring buffer of lightning strikes, for a reader such as the thunder
 * to drain at its own update point. The records are reused, so a strike
 * allocates nothing. When it is full, a new strike replaces the oldest.
 */
export class StrikeQueue {
  private readonly _records: StrikeRecord[];
  private _head = 0;
  private _count = 0;

  constructor(
    capacity = 8,
    /** The clock strike times are read from, in seconds. */
    readonly now: () => number = performanceClock
  ) {
    this._records = [];
    for (let i = 0; i < capacity; i++)
      this._records.push({ x: 0, y: 0, z: 0, chain: 0, time: 0 });
  }

  get size(): number {
    return this._count;
  }

  push(x: number, y: number, z: number, chain: number): void {
    const capacity = this._records.length;
    const record = this._records[(this._head + this._count) % capacity];
    record.x = x;
    record.y = y;
    record.z = z;
    record.chain = chain;
    record.time = this.now();
    if (this._count < capacity) this._count++;
    else this._head = (this._head + 1) % capacity;
  }

  /** The oldest strike, or null. The record is valid until the next push. */
  pop(): StrikeRecord | null {
    if (this._count === 0) return null;
    const record = this._records[this._head];
    this._head = (this._head + 1) % this._records.length;
    this._count--;
    return record;
  }

  clear(): void {
    this._head = 0;
    this._count = 0;
  }
}
