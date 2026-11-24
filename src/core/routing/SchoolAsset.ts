import { IResource } from 'models';
import { Box3, EulerRotationOrder, Vector3 } from 'rewild-common';
import { Renderer, SWIM_STRIDE, SwimBatch, Transform } from 'rewild-renderer';
import { StateMachine } from 'rewild-routing';
import { createHabitat } from '../creatures/Habitat';
import { HerdHome } from '../creatures/HerdHome';
import { School } from '../creatures/School';
import { SchoolFishPreset } from '../creatures/SchoolFishPresets';
import { Asset3D } from './Asset3D';
import { createCreatureWorld } from './Creature';
import { StateMachineData } from './Types';

/** Members one school may have. */
export const MAX_SCHOOL_SIZE = 500;
/** Members when the resource leaves `count` out. */
export const DEFAULT_SCHOOL_SIZE = 100;
/** Metres from home members spawn when the resource leaves `spread` out. */
export const DEFAULT_SCHOOL_SPREAD = 4;
/** Part of the spread a held school takes up vertically. */
const HELD_HEIGHT = 0.35;
/** Radians a held member's heading may stray from the school's. */
const HELD_JITTER = 0.3;

const TWO_PI = Math.PI * 2;
const _forward = new Vector3();
const _bounds = new Box3();
const _offset = new Vector3();

let steerMs = 0;

/** Milliseconds every school has spent steering since the last call. */
export function takeSchoolSteerTime(): number {
  const ms = steerMs;
  steerMs = 0;
  return ms;
}

/**
 * A school of fish placed as one asset, drawn by the shader swim. In game it
 * spawns its members round where it stands and steers them as a `School`. In
 * the editor its members hold in place and wave, so it can be seen.
 */
export class SchoolAsset extends Asset3D {
  /** Every school mounted in game and not yet disposed. */
  static readonly live = new Set<SchoolAsset>();
  school: School | null = null;
  /** The home it swims round. Null makes one where it stands, drifting as
   *  its preset says. */
  home: HerdHome | null = null;
  size = DEFAULT_SCHOOL_SIZE;
  spread = DEFAULT_SCHOOL_SPREAD;

  private batch: SwimBatch | null = null;
  private holdFrame = 0;
  private holdLast = 0;
  private holdBeat: Float32Array | null = null;
  private disposed = false;

  constructor(
    private readonly renderer: Renderer,
    readonly presetName: string,
    readonly preset: SchoolFishPreset,
    /** Members hold in place and wave, as in the editor. */
    private readonly held: boolean
  ) {
    super(new Transform());
    this.transform.userData.school = this;
  }

  /** Reads `count` and `spread` from the resource. Rebuilds a held school. */
  applyProperties(resource: IResource = this.data): void {
    const props = this.buildObjectFromProperties(resource);
    const count = props?.count;
    const spread = props?.spread;
    this.size = Math.max(
      1,
      Math.min(
        MAX_SCHOOL_SIZE,
        Math.round(typeof count === 'number' ? count : DEFAULT_SCHOOL_SIZE)
      )
    );
    this.spread = Math.max(
      0.1,
      typeof spread === 'number' ? spread : DEFAULT_SCHOOL_SPREAD
    );

    if (!this.batch || this.batch.capacity < this.size) {
      this.batch?.dispose();
      const { preset } = this;
      this.batch = new SwimBatch(
        this.renderer,
        preset.model,
        { ...preset.swim, fin: preset.fin },
        this.size
      );
      this.transform.addChild(this.batch.transform);
    }
    if (this.held) this.hold();
  }

  mount(): void {
    super.mount();
    const sm = this.stateMachine as StateMachine<StateMachineData> | null;
    const data = sm?.data;
    if (!data?.gameManager || !this.batch) return;

    _forward.set(0, 0, 1).applyQuaternion(this.initialRotation);
    this.transform.rotation.set(0, 0, 0, EulerRotationOrder.YXZ);
    if (!this.school) {
      const { preset } = this;
      const world = createCreatureWorld(data);
      const habitat = createHabitat([preset.habitat], world);
      const { x, z } = this.initialPosition;
      let home = this.home;
      if (!home) {
        home = new HerdHome(
          x,
          z,
          Math.atan2(_forward.x, _forward.z),
          preset.drift,
          preset.roam,
          habitat
        );
        home.cycle = preset.cycle ?? null;
        home.joinCycle();
      }
      this.school = new School(
        preset.steering,
        preset.swim,
        this.batch.model.body.length * preset.scale,
        habitat,
        world,
        home,
        this.size,
        this.spread
      );
    }
    SchoolAsset.live.add(this);
  }

  /** Members the batch draws. */
  get drawn(): number {
    return this.batch?.count ?? 0;
  }

  /** Steers the school and hands its members to the batch. */
  update(dt: number): void {
    const { school, batch } = this;
    if (!school || !batch) return;
    const started = performance.now();
    school.update(dt, this.inView());
    steerMs += performance.now() - started;

    if (school.asPoint) {
      batch.transform.position.set(
        school.offsetX,
        school.offsetY,
        school.offsetZ
      );
      batch.moved();
      return;
    }
    batch.transform.position.set(0, 0, 0);

    const { x: ox, y: oy, z: oz } = this.transform.position;
    const { phase, amplitude, curve } = school.gaits;
    const { scale } = this.preset;
    const count = Math.min(school.count, batch.capacity);
    for (let i = 0; i < count; i++) {
      batch.setPlace(
        i,
        school.px[i] - ox,
        school.py[i] - oy,
        school.pz[i] - oz,
        scale,
        -school.pitch[i],
        school.heading[i],
        0
      );
      batch.setWave(i, phase[i], amplitude[i], curve[i]);
    }
    batch.count = count;
    batch.commit();
  }

  /** Whether the members, where they were last drawn, are in the camera's view. */
  private inView(): boolean {
    const batch = this.batch!;
    if (batch.count === 0) return true;
    _offset.copy(this.transform.position).add(batch.transform.position);
    _bounds.copy(batch.localBounds).translate(_offset);
    return this.renderer.frustum.intersectsBox(_bounds);
  }

  dispose(): void {
    this.disposed = true;
    SchoolAsset.live.delete(this);
    cancelAnimationFrame(this.holdFrame);
    this.batch?.dispose();
    this.batch = null;
    this.school = null;
    delete this.transform.userData.school;
  }

  /** Lays members out in a flattened ball standing on the placement, facing
   *  forward, and waves them in place. */
  private hold(): void {
    const batch = this.batch!;
    const { size, spread, preset } = this;
    const { swim, steering, scale } = preset;
    const half = spread * HELD_HEIGHT;
    const beat = Math.min(
      swim.maxBeat,
      Math.max(swim.hoverBeat, steering.cruiseSpeed / swim.stride)
    );
    this.holdBeat = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const angle = Math.random() * TWO_PI;
      const distance = spread * Math.sqrt(Math.random());
      batch.setPlace(
        i,
        Math.sin(angle) * distance,
        half + (Math.random() * 2 - 1) * half,
        Math.cos(angle) * distance,
        scale,
        0,
        (Math.random() - 0.5) * HELD_JITTER,
        0
      );
      batch.setWave(i, Math.random() * TWO_PI, swim.amplitude, 0);
      this.holdBeat[i] = beat * (0.9 + Math.random() * 0.2);
    }
    batch.count = size;
    batch.commit();

    cancelAnimationFrame(this.holdFrame);
    this.holdLast = performance.now();
    this.holdFrame = requestAnimationFrame(this.waveHeld);
  }

  private readonly waveHeld = (): void => {
    const { batch, holdBeat } = this;
    if (this.disposed || this.renderer.disposed || !batch || !holdBeat) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.holdLast) / 1000);
    this.holdLast = now;
    this.holdFrame = requestAnimationFrame(this.waveHeld);
    if (!this.transform.parent) return;
    const { data } = batch;
    const amplitude = this.preset.swim.amplitude;
    for (let i = 0; i < batch.count; i++) {
      let phase = data[i * SWIM_STRIDE + 8] + TWO_PI * holdBeat[i] * dt;
      if (phase >= TWO_PI) phase -= TWO_PI;
      batch.setWave(i, phase, amplitude, 0);
    }
    batch.commit();
  };
}
