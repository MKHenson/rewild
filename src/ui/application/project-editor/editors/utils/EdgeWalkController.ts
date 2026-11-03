import { Vector3 } from 'rewild-common';
import { OrbitController } from 'rewild-renderer/lib/input/OrbitController';

// Width of the hover band along each viewport edge, in CSS pixels.
export const EDGE_WALK_MARGIN_PX = 16;
// How long the pointer must rest in a band before the camera starts walking.
export const EDGE_WALK_DWELL_MS = 500;
// Time to ease from standstill to full walk speed.
const RAMP_MS = 400;
// Walk speed as a fraction of the orbit distance per second, so a close-up
// camera creeps and a wide shot covers ground quickly.
const SPEED_PER_DISTANCE = 0.8;
const MIN_SPEED = 5;

const _ORBIT_STATE_NONE = -1;

export interface EdgeDirection {
  forward: number;
  right: number;
}

export type EdgeWalkPhase = 'idle' | 'dwell' | 'walking';

const _CURSORS: Record<string, string> = {
  '1,0': 'n-resize',
  '-1,0': 's-resize',
  '0,-1': 'w-resize',
  '0,1': 'e-resize',
  '1,-1': 'nw-resize',
  '1,1': 'ne-resize',
  '-1,-1': 'sw-resize',
  '-1,1': 'se-resize',
};

/** Arrow cursor pointing the way the camera walks. */
export function edgeCursor(dir: EdgeDirection): string {
  return _CURSORS[`${dir.forward},${dir.right}`] ?? '';
}

/**
 * Which way to walk for a pointer at (x, y) inside a w × h viewport. Top is
 * forward, bottom is back, left/right strafe. Corners combine both axes.
 */
export function edgeDirection(
  x: number,
  y: number,
  width: number,
  height: number,
  margin: number = EDGE_WALK_MARGIN_PX
): EdgeDirection {
  let forward = 0;
  let right = 0;
  if (y < margin) forward = 1;
  else if (y > height - margin) forward = -1;
  if (x < margin) right = -1;
  else if (x > width - margin) right = 1;
  return { forward, right };
}

const _up = new Vector3(0, 1, 0);

/**
 * Ground-plane forward/right axes for a camera at `position` looking at
 * `target`. Looking straight down has no horizontal look direction, so the
 * camera's screen-up axis stands in for forward.
 */
export function walkBasis(
  position: Vector3,
  target: Vector3,
  cameraUp: Vector3,
  outForward: Vector3,
  outRight: Vector3
): void {
  outForward.copy(target).sub(position);
  outForward.y = 0;
  if (outForward.lengthSq() < 1e-8) {
    outForward.copy(cameraUp);
    outForward.y = 0;
  }
  outForward.normalize();
  outRight.crossVectors(outForward, _up);
}

/**
 * Walks the orbit camera across the ground when the pointer rests near a
 * viewport edge, like holding WASD. Camera position and orbit target move
 * together, so the view angle is preserved.
 */
export class EdgeWalkController {
  private dir: EdgeDirection = { forward: 0, right: 0 };
  private dwellStart = 0;
  private lastTime = 0;
  private walked = false;
  private frame: number | null = null;
  private phase: EdgeWalkPhase = 'idle';

  private _forward = new Vector3();
  private _right = new Vector3();
  private _cameraUp = new Vector3();
  private _step = new Vector3();

  constructor(
    private canvas: HTMLElement,
    private orbit: OrbitController,
    private onWalkEnd: () => void,
    private onPhaseChange: (phase: EdgeWalkPhase, dir: EdgeDirection) => void
  ) {
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.stop);
    canvas.addEventListener('pointerdown', this.stop);
    window.addEventListener('blur', this.stop);
  }

  dispose(): void {
    this.stop();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.stop);
    this.canvas.removeEventListener('pointerdown', this.stop);
    window.removeEventListener('blur', this.stop);
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (event.buttons !== 0 || event.pointerType === 'touch') {
      this.stop();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const dir = edgeDirection(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height
    );

    if (dir.forward === 0 && dir.right === 0) {
      this.stop();
      return;
    }

    // Sliding along the edge or into a corner keeps the dwell already earned.
    if (this.frame === null) {
      this.dwellStart = performance.now();
      this.lastTime = this.dwellStart;
      this.frame = requestAnimationFrame(this.tick);
    }
    const changed =
      dir.forward !== this.dir.forward || dir.right !== this.dir.right;
    this.dir = dir;
    if (this.phase === 'idle') this.setPhase('dwell');
    else if (changed) this.setPhase(this.phase);
  };

  private setPhase(phase: EdgeWalkPhase): void {
    this.phase = phase;
    this.canvas.style.cursor = phase === 'idle' ? '' : edgeCursor(this.dir);
    this.onPhaseChange(phase, this.dir);
  }

  private tick = (now: number): void => {
    this.frame = requestAnimationFrame(this.tick);

    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const walkingFor = now - this.dwellStart - EDGE_WALK_DWELL_MS;
    if (walkingFor <= 0) return;

    // Another input owns the camera (brush stroke, gizmo drag, orbit drag).
    if (!this.orbit.enabled || this.orbit.state !== _ORBIT_STATE_NONE) {
      this.dwellStart = now;
      if (this.phase !== 'dwell') this.setPhase('dwell');
      return;
    }
    if (this.phase !== 'walking') this.setPhase('walking');

    const transform = this.orbit.object.camera.transform;
    const position = transform.position;
    const target = this.orbit.target;

    this._cameraUp.set(0, 1, 0).applyQuaternion(transform.quaternion);
    walkBasis(position, target, this._cameraUp, this._forward, this._right);

    const ramp = Math.min(walkingFor / RAMP_MS, 1);
    const speed = Math.max(
      position.distanceTo(target) * SPEED_PER_DISTANCE,
      MIN_SPEED
    );

    this._step
      .copy(this._forward)
      .multiplyScalar(this.dir.forward)
      .addScaledVector(this._right, this.dir.right);
    if (this._step.lengthSq() === 0) return;
    this._step.normalize().multiplyScalar(speed * ramp * dt);

    position.add(this._step);
    target.add(this._step);
    this.orbit.update();
    this.walked = true;
  };

  private stop = (): void => {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.dir = { forward: 0, right: 0 };
    if (this.phase !== 'idle') this.setPhase('idle');
    if (this.walked) {
      this.walked = false;
      this.onWalkEnd();
    }
  };
}
