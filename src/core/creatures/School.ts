import { Vector3 } from 'rewild-common';
import { SwimSettings } from './CreaturePresets';
import { CreatureWorld, Habitat, HeightRange } from './Habitat';
import { HerdHome } from './HerdHome';
import { wrapAngle } from './MovementSystem';
import { FlockPull } from './Flocking';
import { SchoolSteering } from './SchoolFishPresets';
import { GAIT_BURST, GAIT_COAST, SwimGaits } from './SwimGaits';
import { ThreatSample, createThreatSample } from './Threats';

/** Grid cells a school's neighbour grid may use; past this its cells grow. */
export const MAX_GRID_CELLS = 4096;
/** Members a member checks for spacing, at most, nearest cells first. */
export const MAX_SCANNED = 64;
/** Places tried inside the habitat for each member as the school spawns. */
const PLACE_ATTEMPTS = 6;
/** Part of the spread the school spawns over vertically. */
const VERTICAL_SPREAD = 0.3;
/** Metres from the player past which a school steers at the far rate, and
 *  moves as one point while out of view. */
export const STEER_LOD_DISTANCE = 40;
/** Seconds between steering updates of a far school. */
export const FAR_STEER_INTERVAL = 0.1;
/** Metres a member keeps inside the top and bottom of its swim band, at most. */
const BAND_PAD = 0.5;
/** The longest steering pull, in units of `acceleration`. */
const MAX_PULL = 3;
/** Seconds the speed takes to settle on its target. */
const SPEED_SMOOTHING = 0.4;
/** Part of its speed a member keeps while it coasts, and gains in a burst. */
const COAST_SPEED = 0.85;
const BURST_SPEED = 1.15;
/** Half the diagonal of a unit cube: a cell's centre to its corner. */
const HALF_DIAGONAL = Math.sqrt(3) / 2;

/** No water with room to swim. */
const COLUMN_DRY = 0;
/** Water to swim in, outside the habitat. */
const COLUMN_PASS = 1;
/** Inside the habitat. */
const COLUMN_IN = 2;

const TWO_PI = Math.PI * 2;

/** Cell offsets round a member's cell as x, y, z triples, its own first. */
const NEIGHBOUR_CELLS = (() => {
  const offsets: number[][] = [];
  for (let z = -1; z <= 1; z++)
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) offsets.push([x, y, z]);
  const steps = (o: number[]) =>
    Math.abs(o[0]) + Math.abs(o[1]) + Math.abs(o[2]);
  offsets.sort((a, b) => steps(a) - steps(b));
  return new Int8Array(offsets.flat());
})();

export type SchoolState = 'waiting' | 'cruise' | 'evade';

/**
 * Many fish moving as one. Members are indices into flat arrays of world
 * position, velocity and swim wave, not objects. Each step a grid over the
 * members finds neighbours, and each member steers by separation, alignment,
 * cohesion, the pull of the school's home, the habitat and the threats near
 * it. Members spawn around the home once the water under it is loaded.
 *
 * A school far from the player and out of view moves as one point: members
 * stay where they are and the home's travel builds up in `offsetX/Y/Z`, which
 * `settle` adds to every member once it is near or seen again.
 */
export class School {
  readonly capacity: number;
  count = 0;
  state: SchoolState = 'waiting';
  /** Members that felt a threat this steering step. */
  threatened = 0;
  /** It was past STEER_LOD_DISTANCE from the player in the last update. */
  far = false;
  /** It moved as one point in the last update. */
  asPoint = false;
  /** Metres the home has travelled since the members last moved. */
  offsetX = 0;
  offsetY = 0;
  offsetZ = 0;

  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly pz: Float64Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  /** Radians about Y. 0 faces +Z. */
  readonly heading: Float32Array;
  /** Radians nose up. */
  readonly pitch: Float32Array;
  /** Each member's body wave. */
  readonly gaits: SwimGaits;

  readonly home: HerdHome;
  /** The middle of the swim band at the home. */
  homeY = 0;

  private readonly ax: Float32Array;
  private readonly ay: Float32Array;
  private readonly az: Float32Array;
  private readonly fear: Float32Array;
  private readonly lastHeading: Float32Array;
  private readonly cellOf: Int32Array;
  private readonly next: Int32Array;
  private readonly head = new Int32Array(MAX_GRID_CELLS);
  private readonly columnStamp = new Int32Array(MAX_GRID_CELLS);
  private readonly columnCode = new Uint8Array(MAX_GRID_CELLS);
  private readonly columnMin = new Float32Array(MAX_GRID_CELLS);
  private readonly columnMax = new Float32Array(MAX_GRID_CELLS);
  private readonly threatStamp = new Int32Array(MAX_GRID_CELLS);
  private readonly threatFound = new Uint8Array(MAX_GRID_CELLS);
  private readonly threatX = new Float64Array(MAX_GRID_CELLS);
  private readonly threatY = new Float64Array(MAX_GRID_CELLS);
  private readonly threatZ = new Float64Array(MAX_GRID_CELLS);
  private readonly threatFright = new Float32Array(MAX_GRID_CELLS);
  private stamp = 0;
  private gridX = 0;
  private gridY = 0;
  private gridZ = 0;
  private cell = 1;
  private nx = 0;
  private ny = 0;
  private nz = 0;
  private steerTimer = 0;
  private readonly range: HeightRange = { min: 0, max: 0 };
  private readonly player = new Vector3();
  private readonly threat: ThreatSample = createThreatSample();
  private readonly pull: FlockPull;
  /** The band of the last column read, when it has one. */
  private bandMin = 0;
  private bandMax = 0;

  constructor(
    readonly steering: SchoolSteering,
    readonly swim: SwimSettings,
    /** Metres from nose to tail of one member. */
    readonly length: number,
    readonly habitat: Habitat,
    readonly world: CreatureWorld,
    home: HerdHome,
    readonly size: number,
    readonly spread: number,
    private readonly random: () => number = Math.random
  ) {
    this.capacity = size;
    this.home = home;
    this.pull = new FlockPull(steering);
    const n = Math.max(1, size);
    this.px = new Float64Array(n);
    this.py = new Float64Array(n);
    this.pz = new Float64Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.heading = new Float32Array(n);
    this.pitch = new Float32Array(n);
    this.gaits = new SwimGaits(swim, n, random);
    this.ax = new Float32Array(n);
    this.ay = new Float32Array(n);
    this.az = new Float32Array(n);
    this.fear = new Float32Array(n);
    this.lastHeading = new Float32Array(n);
    this.cellOf = new Int32Array(n);
    this.next = new Int32Array(n);
  }

  /**
   * Waits until the water at the home is loaded, then spawns every member.
   * `seen` is whether the school is in view, which keeps a far school
   * moving member by member.
   */
  update(dt: number, seen = true): void {
    if (dt <= 0) return;
    if (this.state === 'waiting' && !this.place()) return;
    if (this.count === 0) return;

    const { home } = this;
    const fromX = home.x;
    const fromY = this.homeY;
    const fromZ = home.z;
    home.update(dt);
    if (this.habitat.heightRange?.(home.x, home.z, this.range))
      this.homeY = (this.range.min + this.range.max) / 2;

    const hasPlayer = this.world.playerPosition(this.player);
    const far =
      !hasPlayer ||
      Math.hypot(home.x - this.player.x, home.z - this.player.z) >
        STEER_LOD_DISTANCE;
    this.far = far;
    this.asPoint = far && !seen;
    if (this.asPoint) {
      this.offsetX += home.x - fromX;
      this.offsetY += this.homeY - fromY;
      this.offsetZ += home.z - fromZ;
      return;
    }
    this.settle();

    this.steerTimer -= dt;
    if (!far || this.steerTimer <= 0) {
      this.steerTimer = FAR_STEER_INTERVAL;
      this.buildGrid();
      this.steer();
    }
    this.integrate(dt);
  }

  /** Moves every member by the travel built up while it moved as a point. */
  settle(): void {
    const { offsetX, offsetY, offsetZ } = this;
    if (offsetX === 0 && offsetY === 0 && offsetZ === 0) return;
    for (let i = 0; i < this.count; i++) {
      this.px[i] += offsetX;
      this.py[i] += offsetY;
      this.pz[i] += offsetZ;
    }
    this.offsetX = this.offsetY = this.offsetZ = 0;
  }

  /** Spawns the members around the home. False while the water is not loaded. */
  place(): boolean {
    const { home, habitat, world, steering, range } = this;
    if (world.sampleHeight(home.x, home.z) === null) return false;
    if (!habitat.heightRange?.(home.x, home.z, range)) {
      this.count = 0;
      this.state = 'cruise';
      return true;
    }
    this.homeY = (range.min + range.max) / 2;

    const vertical = this.spread * VERTICAL_SPREAD;
    const sin = Math.sin(home.heading);
    const cos = Math.cos(home.heading);
    for (let i = 0; i < this.size; i++) {
      let x = home.x;
      let z = home.z;
      for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
        const angle = this.random() * TWO_PI;
        const distance = this.spread * Math.sqrt(this.random());
        const tx = home.x + Math.sin(angle) * distance;
        const tz = home.z + Math.cos(angle) * distance;
        if (!habitat.canBe(tx, tz)) continue;
        x = tx;
        z = tz;
        break;
      }
      let y = this.homeY + (this.random() * 2 - 1) * vertical;
      if (habitat.heightRange!(x, z, range))
        y = Math.max(range.min, Math.min(range.max, y));
      const speed = steering.cruiseSpeed * (0.9 + this.random() * 0.2);
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      this.vx[i] = sin * speed;
      this.vy[i] = 0;
      this.vz[i] = cos * speed;
      this.heading[i] = this.lastHeading[i] = home.heading;
      this.pitch[i] = 0;
      this.gaits.reset(i);
      this.gaits.amplitude[i] = this.swim.amplitude;
      this.ax[i] = this.ay[i] = this.az[i] = 0;
      this.fear[i] = 0;
    }
    this.count = this.size;
    this.state = 'cruise';
    return true;
  }

  /** Buckets every member into a grid of cells at least a neighbour radius wide. */
  private buildGrid(): void {
    const { count, px, py, pz } = this;
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < count; i++) {
      if (px[i] < x0) x0 = px[i];
      if (py[i] < y0) y0 = py[i];
      if (pz[i] < z0) z0 = pz[i];
      if (px[i] > x1) x1 = px[i];
      if (py[i] > y1) y1 = py[i];
      if (pz[i] > z1) z1 = pz[i];
    }

    let cell = this.steering.neighbourRadius;
    let nx = Math.floor((x1 - x0) / cell) + 1;
    let ny = Math.floor((y1 - y0) / cell) + 1;
    let nz = Math.floor((z1 - z0) / cell) + 1;
    while (nx * ny * nz > MAX_GRID_CELLS) {
      cell *= Math.max(1.1, Math.cbrt((nx * ny * nz) / MAX_GRID_CELLS));
      nx = Math.floor((x1 - x0) / cell) + 1;
      ny = Math.floor((y1 - y0) / cell) + 1;
      nz = Math.floor((z1 - z0) / cell) + 1;
    }
    this.cell = cell;
    this.gridX = x0;
    this.gridY = y0;
    this.gridZ = z0;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.head.fill(-1, 0, nx * ny * nz);
    this.stamp++;

    for (let i = 0; i < count; i++) {
      const cx = Math.floor((px[i] - x0) / cell);
      const cy = Math.floor((py[i] - y0) / cell);
      const cz = Math.floor((pz[i] - z0) / cell);
      const c = (cz * ny + cy) * nx + cx;
      this.cellOf[i] = c;
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }

  private steer(): void {
    const { steering, count, px, py, pz, vx, vy, vz, head, next, pull } = this;
    const { nx, ny, nz } = this;
    const limit = steering.acceleration * MAX_PULL;
    this.threatened = 0;

    for (let i = 0; i < count; i++) {
      const x = px[i];
      const y = py[i];
      const z = pz[i];
      const c = this.cellOf[i];
      const cx = c % nx;
      const cy = Math.floor(c / nx) % ny;
      const cz = Math.floor(c / (nx * ny));

      pull.begin();
      let scanned = 0;

      for (
        let o = 0;
        o < NEIGHBOUR_CELLS.length && scanned < MAX_SCANNED;
        o += 3
      ) {
        const gx = cx + NEIGHBOUR_CELLS[o];
        const gy = cy + NEIGHBOUR_CELLS[o + 1];
        const gz = cz + NEIGHBOUR_CELLS[o + 2];
        if (gx < 0 || gx >= nx || gy < 0 || gy >= ny || gz < 0 || gz >= nz)
          continue;
        let j = head[(gz * ny + gy) * nx + gx];
        while (j >= 0 && scanned < MAX_SCANNED) {
          if (j !== i) {
            scanned++;
            pull.neighbour(
              px[j] - x,
              py[j] - y,
              pz[j] - z,
              vx[j],
              vy[j],
              vz[j]
            );
          }
          j = next[j];
        }
      }

      pull.gather(vx[i], vy[i], vz[i]);
      const hx = this.home.x - x;
      const hy = this.homeY - y;
      const hz = this.home.z - z;
      pull.home(hx, hy, hz);
      const homeDistance = Math.hypot(hx, hz);
      let fx = pull.x;
      let fy = pull.y;
      let fz = pull.z;

      const toHomeX = homeDistance > 1e-6 ? hx / homeDistance : 0;
      const toHomeZ = homeDistance > 1e-6 ? hz / homeDistance : 0;
      const code = this.column(x, z);
      if (code !== COLUMN_DRY) {
        const pad = Math.min(BAND_PAD, (this.bandMax - this.bandMin) / 4);
        if (pad > 0) {
          if (y < this.bandMin + pad)
            fy += (steering.habitat * (this.bandMin + pad - y)) / pad;
          else if (y > this.bandMax - pad)
            fy -= (steering.habitat * (y - this.bandMax + pad)) / pad;
        }
      }
      if (code !== COLUMN_IN) {
        fx += toHomeX * steering.habitat;
        fz += toHomeZ * steering.habitat;
      } else {
        const ahead = steering.lookAhead;
        if (this.column(x + vx[i] * ahead, z + vz[i] * ahead) !== COLUMN_IN) {
          fx += toHomeX * steering.habitat;
          fz += toHomeZ * steering.habitat;
        }
      }

      let fear = 0;
      if (this.cellThreat(c)) {
        const ox = this.threatX[c] - x;
        const oy = this.threatY[c] - y;
        const oz = this.threatZ[c] - z;
        pull.x = pull.y = pull.z = 0;
        fear = pull.flee(
          ox,
          oy,
          oz,
          steering.threatRadius * this.threatFright[c],
          steering.threat
        );
        if (fear > 0) {
          fx += pull.x;
          fy += pull.y;
          fz += pull.z;
          this.threatened++;
          if (this.fear[i] === 0)
            this.gaits.escape(
              i,
              wrapAngle(Math.atan2(-ox, -oz) - this.heading[i])
            );
        }
      }
      this.fear[i] = fear;

      const acc = steering.acceleration;
      fx *= acc;
      fy *= acc;
      fz *= acc;
      const length = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (length > limit) {
        const s = limit / length;
        fx *= s;
        fy *= s;
        fz *= s;
      }
      this.ax[i] = fx;
      this.ay[i] = fy;
      this.az[i] = fz;
    }
    this.state = this.threatened > 0 ? 'evade' : 'cruise';
  }

  private integrate(dt: number): void {
    const { steering, count, px, py, pz, vx, vy, vz, gaits } = this;
    const maxPitch = Math.tan(steering.pitch);
    const speedEase = 1 - Math.exp(-dt / SPEED_SMOOTHING);

    for (let i = 0; i < count; i++) {
      let ux = vx[i] + this.ax[i] * dt;
      let uy = vy[i] + this.ay[i] * dt;
      let uz = vz[i] + this.az[i] * dt;

      let flat = Math.hypot(ux, uz);
      const gait = gaits.gait[i];
      const target =
        (steering.cruiseSpeed +
          (steering.fleeSpeed - steering.cruiseSpeed) * this.fear[i]) *
        (gait === GAIT_COAST
          ? COAST_SPEED
          : gait === GAIT_BURST
          ? BURST_SPEED
          : 1);
      if (flat < 1e-4) {
        ux = Math.sin(this.heading[i]) * 1e-4;
        uz = Math.cos(this.heading[i]) * 1e-4;
        flat = 1e-4;
      }
      const speed = flat + (target - flat) * speedEase;
      ux *= speed / flat;
      uz *= speed / flat;
      const climb = speed * maxPitch;
      if (uy > climb) uy = climb;
      else if (uy < -climb) uy = -climb;

      let x = px[i] + ux * dt;
      let y = py[i] + uy * dt;
      let z = pz[i] + uz * dt;
      if (this.column(x, z) === COLUMN_DRY) {
        x = px[i];
        z = pz[i];
        ux = -ux;
        uz = -uz;
        if (this.column(x, z) === COLUMN_DRY) {
          // Stranded where there is no water: head straight for home.
          const hx = this.home.x - x;
          const hz = this.home.z - z;
          const away = Math.hypot(hx, hz) || 1;
          px[i] = x + (hx / away) * speed * dt;
          pz[i] = z + (hz / away) * speed * dt;
          vx[i] = (hx / away) * speed;
          vy[i] = 0;
          vz[i] = (hz / away) * speed;
          continue;
        }
      }
      if (y < this.bandMin) {
        y = this.bandMin;
        if (uy < 0) uy = 0;
      } else if (y > this.bandMax) {
        y = this.bandMax;
        if (uy > 0) uy = 0;
      }

      px[i] = x;
      py[i] = y;
      pz[i] = z;
      vx[i] = ux;
      vy[i] = uy;
      vz[i] = uz;

      const heading = Math.atan2(ux, uz);
      const turn = wrapAngle(heading - this.lastHeading[i]) / dt;
      this.lastHeading[i] = heading;
      this.heading[i] = heading;
      this.pitch[i] = Math.atan2(uy, speed);
      gaits.step(i, dt, Math.hypot(speed, uy), turn, this.length, false);
    }
  }

  /**
   * Whether a threat is near grid cell `c`, read once a steering step from
   * the cell's centre, wide enough to cover its corners.
   */
  private cellThreat(c: number): boolean {
    if (this.threatStamp[c] === this.stamp) return this.threatFound[c] === 1;
    this.threatStamp[c] = this.stamp;
    const { nx, ny, cell } = this;
    const x = this.gridX + ((c % nx) + 0.5) * cell;
    const y = this.gridY + ((Math.floor(c / nx) % ny) + 0.5) * cell;
    const z = this.gridZ + (Math.floor(c / (nx * ny)) + 0.5) * cell;
    const sample = this.threat;
    const found = this.world.nearestThreat(
      x,
      y,
      z,
      this.steering.threatRadius + cell * HALF_DIAGONAL,
      sample
    );
    this.threatFound[c] = found ? 1 : 0;
    if (found) {
      this.threatX[c] = sample.x;
      this.threatY[c] = sample.y;
      this.threatZ[c] = sample.z;
      this.threatFright[c] = sample.fright;
    }
    return found;
  }

  /**
   * Whether the habitat holds the column at (x, z), with its swim band in
   * `bandMin` and `bandMax`. Columns inside the grid are read once a steering
   * step.
   */
  private column(x: number, z: number): number {
    const cx = Math.floor((x - this.gridX) / this.cell);
    const cz = Math.floor((z - this.gridZ) / this.cell);
    const cached = cx >= 0 && cx < this.nx && cz >= 0 && cz < this.nz;
    const c = cz * this.nx + cx;
    if (cached && this.columnStamp[c] === this.stamp) {
      this.bandMin = this.columnMin[c];
      this.bandMax = this.columnMax[c];
      return this.columnCode[c];
    }

    // The centre of a cached column stands for all of it.
    const sx = cached ? this.gridX + (cx + 0.5) * this.cell : x;
    const sz = cached ? this.gridZ + (cz + 0.5) * this.cell : z;
    const { habitat, range } = this;
    let code = COLUMN_DRY;
    if (habitat.heightRange?.(sx, sz, range)) {
      code = habitat.canBe(sx, sz) ? COLUMN_IN : COLUMN_PASS;
      this.bandMin = range.min;
      this.bandMax = range.max;
    }
    if (cached) {
      this.columnStamp[c] = this.stamp;
      this.columnCode[c] = code;
      this.columnMin[c] = this.bandMin;
      this.columnMax[c] = this.bandMax;
    }
    return code;
  }
}
