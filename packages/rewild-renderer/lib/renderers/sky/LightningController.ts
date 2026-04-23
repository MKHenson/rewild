import { Vector3 } from 'rewild-common';

export interface LightningStrike {
  flashIntensity: number;
  boltVisible: boolean;
  /** Pre-allocated flat vec3 array; valid point count is boltPathPtCount. */
  boltPath: Float32Array;
  boltPathPtCount: number;
  /** Always 3 pre-allocated arrays; boltBranchCount tells how many are active. */
  boltBranches: [Float32Array, Float32Array, Float32Array];
  boltBranchPtCounts: [number, number, number];
  boltBranchCount: number;
  boltIntensity: number;
}

type Phase = 'idle' | 'bolt' | 'flash' | 'fade';

// Duration (ms) the main lightning bolt is visible
const BOLT_MS = 150;
// Duration (ms) of the bright flash after the bolt
const FLASH_MS = 80;
// Duration (ms) for the flash to fade out
const FADE_MS = 100;
// Minimum cloudiness (0–1) required for lightning to occur
const MIN_CLOUDINESS = 0.85;
// Minimum precipitation (0–1) required for lightning to occur
const MIN_PRECIPITATION = 0.8;
// Y position (height) of the cloud base where lightning starts
const CLOUD_BASE_Y = 520;
// Number of fractal subdivision levels for bolt shape
const FRACTAL_LEVELS = 4;
// Maximum displacement for bolt fractalization at the first level
const BASE_DISPLACEMENT = 80;
// Minimum and maximum gap (ms) between chained lightning strikes
const CHAIN_GAP_MS: [number, number] = [50, 200];
const MIN_LIGHTNING_DISTANCE = 700;
const MAX_LIGHTNING_DISTANCE = 1200;

// Max point counts after N midpoint-subdivision levels: 2^N + 1
const MAX_MAIN_PTS = (1 << FRACTAL_LEVELS) + 1; // 17
const MAX_BRANCH_PTS = (1 << 3) + 1; //  9

function seededRand(seed: number): number {
  const x = Math.sin(seed + 1.9898) * 43758.5453;
  return x - Math.floor(x);
}

export class LightningController {
  private phase: Phase = 'idle';
  private phaseTimer = 0;
  private nextStrikeIn = 8000;
  private chainCount = 0;
  private chainGap = 0;
  private seed = 0;

  // Strike position stored in-place (no per-strike allocation)
  private readonly strikePos = new Float32Array(3);
  private hasStrikePos = false;

  // Pending manually-triggered position
  private readonly pendingPos = new Float32Array(3);
  private hasPendingPos = false;

  // Ping-pong work buffers for fractal subdivision — no allocations during generation
  private readonly genBufA = new Float32Array(MAX_MAIN_PTS * 3);
  private readonly genBufB = new Float32Array(MAX_MAIN_PTS * 3);
  private readonly branchBufA = new Float32Array(MAX_BRANCH_PTS * 3);
  private readonly branchBufB = new Float32Array(MAX_BRANCH_PTS * 3);

  readonly currentStrike: LightningStrike = {
    flashIntensity: 0,
    boltVisible: false,
    boltPath: new Float32Array(MAX_MAIN_PTS * 3),
    boltPathPtCount: 0,
    boltBranches: [
      new Float32Array(MAX_BRANCH_PTS * 3),
      new Float32Array(MAX_BRANCH_PTS * 3),
      new Float32Array(MAX_BRANCH_PTS * 3),
    ],
    boltBranchPtCounts: [0, 0, 0],
    boltBranchCount: 0,
    boltIntensity: 0,
  };

  /**
   * Advance the lightning state machine by one frame.
   * @param deltaMs        - frame time in milliseconds
   * @param cloudiness     - 0–1
   * @param precipitation  - 0–1
   * @param cameraPos      - world-space camera position
   * @param cameraFwdX     - normalised forward X in XZ plane
   * @param cameraFwdZ     - normalised forward Z in XZ plane
   */
  update(
    deltaMs: number,
    cloudiness: number,
    precipitation: number,
    cameraPos: Vector3,
    cameraFwdX: number,
    cameraFwdZ: number
  ): LightningStrike {
    const strike = this.currentStrike;
    const stormActive =
      cloudiness > MIN_CLOUDINESS && precipitation > MIN_PRECIPITATION;

    // Compute attenuation factor for flash based on distance to camera
    let flashAttenuation = 1;
    if (this.hasStrikePos) {
      const dx = cameraPos.x - this.strikePos[0];
      const dy = cameraPos.y - this.strikePos[1];
      const dz = cameraPos.z - this.strikePos[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // 1.0 at 0m, 0.5 at 1000m, 0.2 at 2500m, 0.1 at 4000m, never below 0.05
      flashAttenuation = Math.max(0.05, 1 / (1 + dist / 1000));
    }

    switch (this.phase) {
      case 'idle': {
        strike.flashIntensity = 0;
        strike.boltVisible = false;

        if (!stormActive) {
          this.nextStrikeIn = 8000;
          break;
        }

        this.nextStrikeIn -= deltaMs;
        if (this.nextStrikeIn <= 0 || this.hasPendingPos) {
          this.beginStrike(cameraPos, cameraFwdX, cameraFwdZ);
        }
        break;
      }

      case 'bolt': {
        // Keep sky dark while bolt is visible — flash fires once bolt disappears
        strike.boltVisible = true;
        strike.flashIntensity = 0;
        this.phaseTimer -= deltaMs;
        if (this.phaseTimer <= 0) {
          this.phase = 'flash';
          this.phaseTimer = FLASH_MS;
        }
        break;
      }

      case 'flash': {
        strike.boltVisible = false;
        strike.flashIntensity = strike.boltIntensity * flashAttenuation;
        this.phaseTimer -= deltaMs;
        if (this.phaseTimer <= 0) {
          this.phase = 'fade';
          this.phaseTimer = FADE_MS;
        }
        break;
      }

      case 'fade': {
        strike.boltVisible = false;
        strike.flashIntensity =
          strike.boltIntensity * (this.phaseTimer / FADE_MS) * flashAttenuation;
        this.phaseTimer -= deltaMs;
        if (this.phaseTimer <= 0) {
          // Chain lightning: max 2 follow-on strikes, each only 40% likely
          if (stormActive && this.chainCount < 2 && Math.random() < 0.4) {
            this.chainCount++;
            this.nextStrikeIn = this.chainGap;
          } else {
            this.chainCount = 0;
            // At max storm (intensity=1): ~12s base; at threshold (intensity~0.26): ~45s base
            const intensity = cloudiness * precipitation;
            const base = 45000 + (12000 - 45000) * intensity;
            this.nextStrikeIn = base + Math.random() * base * 0.4;
          }
          strike.flashIntensity = 0;
          this.phase = 'idle';
        }
        break;
      }
    }

    return strike;
  }

  /**
   * Trigger a lightning strike immediately.
   * @param worldPos  - optional world XZ position of the strike;
   *                    if omitted, position is auto-generated near the camera.
   */
  triggerStrike(worldPos?: [number, number, number]): void {
    if (worldPos) {
      this.pendingPos[0] = worldPos[0];
      this.pendingPos[1] = worldPos[1];
      this.pendingPos[2] = worldPos[2];
      this.hasPendingPos = true;
    } else {
      this.hasPendingPos = false;
    }
    this.nextStrikeIn = 0;
    if (this.phase !== 'idle') {
      this.phase = 'idle';
      this.phaseTimer = 0;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  private beginStrike(
    cameraPos: Vector3,
    cameraFwdX: number,
    cameraFwdZ: number
  ): void {
    let strikeX: number;
    let strikeZ: number;

    if (this.hasPendingPos) {
      strikeX = this.pendingPos[0];
      strikeZ = this.pendingPos[2];
      this.hasPendingPos = false;
    } else {
      // Rotate camera forward by a random angle ±45° then pick a random distance
      const angle = (Math.random() - 0.5) * (Math.PI / 2);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dirX = cameraFwdX * cos - cameraFwdZ * sin;
      const dirZ = cameraFwdX * sin + cameraFwdZ * cos;
      const dist =
        MIN_LIGHTNING_DISTANCE + Math.random() * MAX_LIGHTNING_DISTANCE;
      strikeX = cameraPos.x + dirX * dist;
      strikeZ = cameraPos.z + dirZ * dist;
    }

    // Store strike position in-place for flash attenuation
    this.strikePos[0] = strikeX;
    this.strikePos[1] = CLOUD_BASE_Y;
    this.strikePos[2] = strikeZ;
    this.hasStrikePos = true;

    const seed = ++this.seed;
    const endX = strikeX + (Math.random() - 0.5) * 20;
    const endZ = strikeZ + (Math.random() - 0.5) * 20;

    this.generateBolt(strikeX, CLOUD_BASE_Y, strikeZ, endX, -50, endZ, seed);

    this.currentStrike.boltIntensity = 0.7 + Math.random() * 0.3;
    this.phase = 'bolt';
    this.phaseTimer = BOLT_MS;
    // Gap between chained lightning strikes, controlled by CHAIN_GAP_MS
    this.chainGap =
      CHAIN_GAP_MS[0] + Math.random() * (CHAIN_GAP_MS[1] - CHAIN_GAP_MS[0]);
  }

  /**
   * Subdivide a path one fractal level using midpoint displacement.
   * Reads ptCount points from src, writes (ptCount*2 - 1) points to dst.
   * Returns the new point count. Zero-allocation.
   */
  private subdividePath(
    src: Float32Array,
    dst: Float32Array,
    ptCount: number,
    seedX: number,
    seedZ: number,
    scale: number
  ): number {
    let di = 0;
    for (let i = 0; i < ptCount - 1; i++) {
      const s = i * 3;
      const ax = src[s],
        ay = src[s + 1],
        az = src[s + 2];
      const bx = src[s + 3],
        by = src[s + 4],
        bz = src[s + 5];
      dst[di++] = ax;
      dst[di++] = ay;
      dst[di++] = az;
      dst[di++] = (ax + bx) * 0.5 + (seededRand(seedX + i * 7) - 0.5) * scale;
      dst[di++] = (ay + by) * 0.5;
      dst[di++] = (az + bz) * 0.5 + (seededRand(seedZ + i * 11) - 0.5) * scale;
    }
    const last = (ptCount - 1) * 3;
    dst[di++] = src[last];
    dst[di++] = src[last + 1];
    dst[di] = src[last + 2];
    return ptCount * 2 - 1;
  }

  /**
   * Generate bolt geometry directly into currentStrike buffers.
   * Uses pre-allocated ping-pong buffers — no heap allocations.
   */
  private generateBolt(
    startX: number,
    startY: number,
    startZ: number,
    endX: number,
    endY: number,
    endZ: number,
    seed: number
  ): void {
    const strike = this.currentStrike;

    // ── Main path ──────────────────────────────────────────────────────────
    this.genBufA[0] = startX;
    this.genBufA[1] = startY;
    this.genBufA[2] = startZ;
    this.genBufA[3] = endX;
    this.genBufA[4] = endY;
    this.genBufA[5] = endZ;

    let cur = this.genBufA;
    let next = this.genBufB;
    let ptCount = 2;

    for (let level = 0; level < FRACTAL_LEVELS; level++) {
      const scale = BASE_DISPLACEMENT / Math.pow(2, level);
      ptCount = this.subdividePath(
        cur,
        next,
        ptCount,
        seed + level * 13,
        seed + level * 17,
        scale
      );
      const tmp = cur;
      cur = next;
      next = tmp;
    }

    // Copy result to pre-allocated output (no allocation)
    for (let i = 0, n = ptCount * 3; i < n; i++) strike.boltPath[i] = cur[i];
    strike.boltPathPtCount = ptCount;

    // ── Branches ───────────────────────────────────────────────────────────
    const numBranches = 2 + Math.floor(Math.random() * 2);
    strike.boltBranchCount = numBranches;

    for (let b = 0; b < numBranches; b++) {
      const branchFrom = Math.floor(ptCount * (0.2 + Math.random() * 0.4));
      const bi = branchFrom * 3;
      const bp0x = cur[bi],
        bp0y = cur[bi + 1],
        bp0z = cur[bi + 2];

      this.branchBufA[0] = bp0x;
      this.branchBufA[1] = bp0y;
      this.branchBufA[2] = bp0z;
      this.branchBufA[3] = bp0x + (seededRand(seed + b * 100) - 0.5) * 200;
      this.branchBufA[4] = bp0y - (100 + Math.random() * 200);
      this.branchBufA[5] = bp0z + (seededRand(seed + b * 101) - 0.5) * 200;

      let bCur = this.branchBufA;
      let bNext = this.branchBufB;
      let bPtCount = 2;

      for (let level = 0; level < 3; level++) {
        const scale = 30 / Math.pow(2, level);
        bPtCount = this.subdividePath(
          bCur,
          bNext,
          bPtCount,
          seed + b * 200 + level * 13,
          seed + b * 201 + level * 17,
          scale
        );
        const tmp = bCur;
        bCur = bNext;
        bNext = tmp;
      }

      const dest = strike.boltBranches[b];
      for (let i = 0, n = bPtCount * 3; i < n; i++) dest[i] = bCur[i];
      strike.boltBranchPtCounts[b] = bPtCount;
    }
  }
}
