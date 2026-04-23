import { Vector3 } from 'rewild-common';

export interface LightningStrike {
  flashIntensity: number;
  boltVisible: boolean;
  boltPath: Float32Array | null;
  boltBranches: Float32Array[];
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
const MIN_LIGHTNING_DISTANCE = 1000;
const MAX_LIGHTNING_DISTANCE = 2000;

function seededRand(seed: number): number {
  const x = Math.sin(seed + 1.9898) * 43758.5453;
  return x - Math.floor(x);
}

export class LightningController {
  private phase: Phase = 'idle';
  private phaseTimer = 0;
  private nextStrikeIn = 8000;
  private pendingWorldPos: [number, number, number] | null = null;
  private chainCount = 0;
  private chainGap = 0;
  private seed = 0;

  // Store the last strike position for distance-based flash attenuation
  private lastStrikePos: [number, number, number] | null = null;

  readonly currentStrike: LightningStrike = {
    flashIntensity: 0,
    boltVisible: false,
    boltPath: null,
    boltBranches: [],
    boltIntensity: 0,
  };

  /**
   * Advance the lightning state machine by one frame.
   * @param deltaMs        - frame time in milliseconds
   * @param cloudiness     - 0–1
   * @param precipitation  - 0–1
   * @param cameraPos      - world-space camera position [x, y, z]
   * @param cameraFwdXZ    - normalised forward direction in XZ plane [x, z]
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
    if (this.lastStrikePos) {
      const dx = cameraPos.x - this.lastStrikePos[0];
      const dy = cameraPos.y - this.lastStrikePos[1];
      const dz = cameraPos.z - this.lastStrikePos[2];
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
        if (this.nextStrikeIn <= 0 || this.pendingWorldPos !== null) {
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
    this.pendingWorldPos = worldPos ?? null;
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

    if (this.pendingWorldPos) {
      [strikeX, , strikeZ] = this.pendingWorldPos;
      this.pendingWorldPos = null;
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

    // Store the last strike position for attenuation
    this.lastStrikePos = [strikeX, CLOUD_BASE_Y, strikeZ];

    const seed = ++this.seed;
    const start: [number, number, number] = [strikeX, CLOUD_BASE_Y, strikeZ];
    const end: [number, number, number] = [
      strikeX + (Math.random() - 0.5) * 20,
      -50, // below terrain; depth test clips the bolt at the surface
      strikeZ + (Math.random() - 0.5) * 20,
    ];

    const { path, branches } = this.generateBolt(start, end, seed);

    this.currentStrike.boltPath = path;
    this.currentStrike.boltBranches = branches;
    this.currentStrike.boltIntensity = 0.7 + Math.random() * 0.3;

    this.phase = 'bolt';
    this.phaseTimer = BOLT_MS;
    // Gap between chained lightning strikes, controlled by CHAIN_GAP_MS
    this.chainGap =
      CHAIN_GAP_MS[0] + Math.random() * (CHAIN_GAP_MS[1] - CHAIN_GAP_MS[0]);
  }

  private generateBolt(
    start: [number, number, number],
    end: [number, number, number],
    seed: number
  ): { path: Float32Array; branches: Float32Array[] } {
    let pts: [number, number, number][] = [start, end];

    for (let level = 0; level < FRACTAL_LEVELS; level++) {
      const newPts: [number, number, number][] = [];
      const scale = BASE_DISPLACEMENT / Math.pow(2, level);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const mid: [number, number, number] = [
          (p0[0] + p1[0]) / 2 +
            (seededRand(seed + level * 13 + i * 7) - 0.5) * scale,
          (p0[1] + p1[1]) / 2,
          (p0[2] + p1[2]) / 2 +
            (seededRand(seed + level * 17 + i * 11) - 0.5) * scale,
        ];
        newPts.push(p0, mid);
      }
      newPts.push(pts[pts.length - 1]);
      pts = newPts;
    }

    const numBranches = 2 + Math.floor(Math.random() * 2);
    const branches: Float32Array[] = [];

    for (let b = 0; b < numBranches; b++) {
      const branchFrom = Math.floor(pts.length * (0.2 + Math.random() * 0.4));
      const bp0 = pts[branchFrom];
      const bEnd: [number, number, number] = [
        bp0[0] + (seededRand(seed + b * 100) - 0.5) * 200,
        bp0[1] - (100 + Math.random() * 200),
        bp0[2] + (seededRand(seed + b * 101) - 0.5) * 200,
      ];

      let bPts: [number, number, number][] = [bp0, bEnd];
      for (let level = 0; level < 3; level++) {
        const newBPts: [number, number, number][] = [];
        const scale = 30 / Math.pow(2, level);
        for (let i = 0; i < bPts.length - 1; i++) {
          const p0 = bPts[i];
          const p1 = bPts[i + 1];
          const mid: [number, number, number] = [
            (p0[0] + p1[0]) / 2 +
              (seededRand(seed + b * 200 + level * 13 + i * 7) - 0.5) * scale,
            (p0[1] + p1[1]) / 2,
            (p0[2] + p1[2]) / 2 +
              (seededRand(seed + b * 201 + level * 17 + i * 11) - 0.5) * scale,
          ];
          newBPts.push(p0, mid);
        }
        newBPts.push(bPts[bPts.length - 1]);
        bPts = newBPts;
      }

      const arr = new Float32Array(bPts.length * 3);
      for (let i = 0; i < bPts.length; i++) {
        arr[i * 3] = bPts[i][0];
        arr[i * 3 + 1] = bPts[i][1];
        arr[i * 3 + 2] = bPts[i][2];
      }
      branches.push(arr);
    }

    const path = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      path[i * 3] = pts[i][0];
      path[i * 3 + 1] = pts[i][1];
      path[i * 3 + 2] = pts[i][2];
    }

    return { path, branches };
  }
}
