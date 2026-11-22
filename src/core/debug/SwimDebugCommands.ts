import { Renderer, SwimBatch } from 'rewild-renderer';
import {
  SCHOOL_FISH_PRESETS,
  getSchoolFishPreset,
} from '../creatures/SchoolFishPresets';

const TWO_PI = Math.PI * 2;
/** Body lengths between neighbours in the test block. */
const SPACING = 1.5;
/** Metres from the camera to the near face of the block, at the least. */
const MIN_DISTANCE = 1.5;
/** Seconds a member's turn curve takes to swing across and back. */
const TURN_PERIOD = 4;

// Shader swim check: a block of one model's fish waving in place, drawn in one
// call per primitive.
export function registerSwimDebugCommands(renderer: Renderer) {
  let shown: { batch: SwimBatch; frame: number } | null = null;

  (window as any).hideSwimInstances = () => {
    if (!shown) return;
    cancelAnimationFrame(shown.frame);
    shown.batch.dispose();
    shown = null;
  };

  (window as any).showSwimInstances = (
    preset?: string,
    count = 1000,
    speed = 0.5,
    turn = 0.3
  ) => {
    if (preset === undefined) {
      console.log(
        `showSwimInstances(preset, count = 1000, speed = 0.5, turn = 0.3) — ` +
          `a block of a school fish preset's model at its scale along ` +
          `the view, each beating at its own phase as if swimming at speed ` +
          `m/s, its spine curving through turn of the preset's turnCurve and ` +
          `back. One draw per primitive covers every one.\n` +
          `Presets: ${Object.keys(SCHOOL_FISH_PRESETS).join(', ')}\n` +
          `hideSwimInstances() takes them away again.`
      );
      return;
    }

    (window as any).hideSwimInstances();

    let settings;
    let batch: SwimBatch;
    try {
      settings = getSchoolFishPreset(preset);
      batch = new SwimBatch(
        renderer,
        settings.model,
        { ...settings.swim, fin: settings.fin },
        count
      );
    } catch (error) {
      console.warn(`showSwimInstances: ${(error as Error).message}`);
      return;
    }

    const { swim, scale } = settings;
    const camera = renderer.camera.camera;
    const m = camera.transform.matrixWorld.elements;
    let fx = -m[8];
    let fz = -m[10];
    const flat = Math.hypot(fx, fz) || 1;
    fx /= flat;
    fz /= flat;
    const rx = -fz;
    const rz = fx;
    // Side on to the view, so the wave shows.
    const heading = Math.atan2(rx, rz);

    const length = batch.model.body.length * scale;
    const gap = length * SPACING;
    const side = Math.ceil(Math.cbrt(count));
    const half = ((side - 1) * gap) / 2;
    const distance = Math.max(MIN_DISTANCE, length * 2) + half;

    batch.transform.position.set(
      m[12] + fx * distance,
      m[13],
      m[14] + fz * distance
    );

    const beat = new Float32Array(count);
    const phase = new Float32Array(count);
    const turnPhase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = (i % side) * gap - half;
      const b = (Math.floor(i / side) % side) * gap - half;
      const c = Math.floor(i / (side * side)) * gap - half;
      const jitter = gap * 0.25;
      batch.setPlace(
        i,
        rx * a + fx * c + (Math.random() - 0.5) * jitter,
        b + (Math.random() - 0.5) * jitter,
        rz * a + fz * c + (Math.random() - 0.5) * jitter,
        scale,
        0,
        heading + (Math.random() - 0.5) * 0.3,
        0
      );
      const rate = Math.min(
        swim.maxBeat,
        Math.max(swim.hoverBeat, speed / swim.stride)
      );
      beat[i] = rate * (0.9 + Math.random() * 0.2);
      phase[i] = Math.random() * TWO_PI;
      turnPhase[i] = Math.random() * TWO_PI;
    }
    batch.count = count;
    renderer.scene.addChild(batch.transform);

    const curve = swim.turnCurve * turn;
    let last = performance.now();
    let clock = 0;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      const sweep = (TWO_PI * clock) / TURN_PERIOD;
      for (let i = 0; i < count; i++) {
        let p = phase[i] + TWO_PI * beat[i] * dt;
        if (p >= TWO_PI) p -= TWO_PI;
        phase[i] = p;
        batch.setWave(
          i,
          p,
          swim.amplitude,
          curve * Math.sin(sweep + turnPhase[i])
        );
      }
      batch.commit();
      shown!.frame = requestAnimationFrame(tick);
    };

    shown = { batch, frame: requestAnimationFrame(tick) };
    batch.commit();
    console.log(
      `${count} '${preset}' fish up, model '${settings.model}' at scale ${scale}, ${batch.meshes.length} ` +
        `draw(s) for all of them, ${length.toFixed(2)} m long, pivot at ` +
        `${batch.model.body.pivot.toFixed(2)} of the body.`
    );
  };
}
