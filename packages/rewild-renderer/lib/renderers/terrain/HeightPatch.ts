import { SculptHeightSource, TouchedChunk } from './Sculpt';

/** A loaded owner supplied the sample. */
const READABLE = 1;
/** An owner of the sample is not loaded, so an edit leaves it alone. */
const MISSING = 2;

// Chunk (cx, cy) owns world sample (wx, wz) when |wx - cx * span| <= half and
// |wz - cy * span| <= half; sample (sx, sy) of the chunk sits at world
// (cx * span + sx - half, cy * span + half - sy).
interface ChunkBox {
  cx: number;
  cy: number;
  heights: Float32Array | null;
}

/**
 * The LOD-0 heights over a box of world samples (x0, z0)–(x1, z1), gathered
 * from every chunk that owns them for one brush edit in Rust, then written
 * back to the chunks it changed. Row r holds world z0 + r, and a row runs +x.
 *
 * A sample is edited only when every chunk that owns it is loaded, and is
 * written back to each of them, so shared edge samples stay equal.
 */
export class HeightPatch {
  readonly width: number;
  readonly height: number;
  readonly heights: Float32Array;
  readonly flags: Uint8Array;
  private readonly chunkSize: number;
  private readonly span: number;
  private readonly half: number;
  private readonly chunks: ChunkBox[] = [];

  constructor(
    private readonly source: SculptHeightSource,
    readonly x0: number,
    readonly z0: number,
    x1: number,
    z1: number
  ) {
    this.chunkSize = source.chunkSize;
    this.span = this.chunkSize - 1;
    this.half = this.span / 2;
    this.width = Math.max(0, x1 - x0 + 1);
    this.height = Math.max(0, z1 - z0 + 1);
    this.heights = new Float32Array(this.width * this.height);
    this.flags = new Uint8Array(this.width * this.height);
    if (this.width === 0 || this.height === 0) return;

    const { span, half } = this;
    for (
      let cy = Math.ceil((z0 - half) / span);
      cy <= Math.floor((z1 + half) / span);
      cy++
    )
      for (
        let cx = Math.ceil((x0 - half) / span);
        cx <= Math.floor((x1 + half) / span);
        cx++
      )
        this.chunks.push({ cx, cy, heights: source.getHeights(cx, cy) });

    for (const chunk of this.chunks) {
      if (!chunk.heights) continue;
      this.rows(chunk.cx, chunk.cy, 0, (row, at, count) => {
        this.heights.set(chunk.heights!.subarray(at, at + count), row);
        this.flags.fill(READABLE, row, row + count);
      });
    }
    for (const chunk of this.chunks) {
      if (chunk.heights) continue;
      this.rows(chunk.cx, chunk.cy, 0, (row, _, count) => {
        for (let i = row; i < row + count; i++) this.flags[i] |= MISSING;
      });
    }
  }

  /** The patch as the WASM edit functions take it. */
  args() {
    return [
      this.heights,
      this.flags,
      this.x0,
      this.z0,
      this.width,
      this.span,
      this.source.metersPerSample ?? 1,
    ] as const;
  }

  /**
   * A per-chunk LOD-0 plane over the patch, each sample read from its first
   * owner, the chunk with the lowest cx and cy, so a shared sample has one
   * home. NaN where that chunk has no plane.
   */
  plane(get: (cx: number, cy: number) => Float32Array | null): Float32Array {
    const out = new Float32Array(this.heights.length).fill(NaN);
    for (const { cx, cy } of this.chunks) {
      const plane = get(cx, cy);
      if (!plane) continue;
      this.rows(cx, cy, 1, (row, at, count) =>
        out.set(plane.subarray(at, at + count), row)
      );
    }
    return out;
  }

  /** Writes a plane from `plane()` back to each sample's first owner. */
  writePlane(
    values: Float32Array,
    get: (cx: number, cy: number) => Float32Array | null
  ) {
    for (const { cx, cy } of this.chunks) {
      const plane = get(cx, cy);
      if (!plane) continue;
      this.rows(cx, cy, 1, (row, at, count) =>
        plane.set(values.subarray(row, row + count), at)
      );
    }
  }

  /**
   * Writes the heights back to the chunks an edit changed, given as the
   * (cx, cy) pairs it returned, and returns them.
   */
  commit(changed: Int32Array): TouchedChunk[] {
    const touched: TouchedChunk[] = [];
    for (let k = 0; k + 1 < changed.length; k += 2) {
      const cx = changed[k];
      const cy = changed[k + 1];
      const chunk = this.chunks.find((c) => c.cx === cx && c.cy === cy);
      const heights = chunk?.heights;
      if (!heights) continue;
      this.rows(cx, cy, 0, (row, at, count) =>
        heights.set(this.heights.subarray(row, row + count), at)
      );
      touched.push({ cx, cy, heights });
    }
    return touched;
  }

  // Calls `visit` for each row of the patch that chunk (cx, cy) covers, with
  // the row's first patch index, its first index in the chunk and its length.
  // `inset` 1 drops the chunk's low x and z edges, which its neighbours own
  // first.
  private rows(
    cx: number,
    cy: number,
    inset: number,
    visit: (row: number, at: number, count: number) => void
  ) {
    const { span, half, chunkSize, x0, z0, width, height } = this;
    const ax0 = Math.max(x0, cx * span - half + inset);
    const ax1 = Math.min(x0 + width - 1, cx * span + half);
    const az0 = Math.max(z0, cy * span - half + inset);
    const az1 = Math.min(z0 + height - 1, cy * span + half);
    if (ax1 < ax0) return;
    const count = ax1 - ax0 + 1;
    const sx = ax0 - cx * span + half;
    for (let wz = az0; wz <= az1; wz++)
      visit(
        (wz - z0) * width + (ax0 - x0),
        (cy * span + half - wz) * chunkSize + sx,
        count
      );
  }
}
