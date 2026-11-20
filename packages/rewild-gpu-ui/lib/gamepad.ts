import type { UIKeyboardInit } from './events';

/** The parts of a DOM `Gamepad` the reader uses. */
export interface GamepadState {
  readonly index: number;
  readonly mapping: string;
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

export type GamepadKey = (action: 'down' | 'up', init: UIKeyboardInit) => void;

interface Control {
  /** The DOM key the control acts as, so a listener handles a key and a gamepad the same. */
  key: string;
  /** The physical control, in the place of the DOM's key code. */
  code: string;
  /** Repeats while held, as a held key does. */
  repeats: boolean;
  /** Down for this pad. */
  read(pad: GamepadState, held: boolean): boolean;
}

/** Button indices in the standard mapping. */
const A = 0;
const B = 1;
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

/** The stick points when it is pushed past this, and stops when it comes back past the lower value. */
const STICK_ON = 0.5;
const STICK_OFF = 0.3;

/** The right stick's axes in the standard mapping, and the tilt it ignores. */
const RIGHT_X = 2;
const RIGHT_Y = 3;
const RIGHT_DEAD_ZONE = 0.2;

/** The repeat time of a synced control, which never repeats. */
const SYNCED = Infinity;

/** Milliseconds before a held control repeats, and between repeats. */
export const REPEAT_DELAY = 400;
export const REPEAT_INTERVAL = 100;

function button(index: number) {
  return (pad: GamepadState) => pad.buttons[index]?.pressed ?? false;
}

/** The left stick, pushed along one axis, more than along the other. */
function stick(axis: 0 | 1, sign: 1 | -1) {
  return (pad: GamepadState, held: boolean) => {
    const along = (pad.axes[axis] ?? 0) * sign;
    const across = Math.abs(pad.axes[1 - axis] ?? 0);
    return held ? along > STICK_OFF : along > STICK_ON && along > across;
  };
}

const CONTROLS: Control[] = [
  { key: 'Enter', code: 'GamepadA', repeats: false, read: button(A) },
  { key: 'Escape', code: 'GamepadB', repeats: false, read: button(B) },
  {
    key: 'ArrowUp',
    code: 'GamepadDpadUp',
    repeats: true,
    read: button(DPAD_UP),
  },
  {
    key: 'ArrowDown',
    code: 'GamepadDpadDown',
    repeats: true,
    read: button(DPAD_DOWN),
  },
  {
    key: 'ArrowLeft',
    code: 'GamepadDpadLeft',
    repeats: true,
    read: button(DPAD_LEFT),
  },
  {
    key: 'ArrowRight',
    code: 'GamepadDpadRight',
    repeats: true,
    read: button(DPAD_RIGHT),
  },
  { key: 'ArrowUp', code: 'GamepadStickUp', repeats: true, read: stick(1, -1) },
  {
    key: 'ArrowDown',
    code: 'GamepadStickDown',
    repeats: true,
    read: stick(1, 1),
  },
  {
    key: 'ArrowLeft',
    code: 'GamepadStickLeft',
    repeats: true,
    read: stick(0, -1),
  },
  {
    key: 'ArrowRight',
    code: 'GamepadStickRight',
    repeats: true,
    read: stick(0, 1),
  },
];

/**
 * Turns gamepads into key presses. A is Enter, B is Escape, and the d-pad and
 * the left stick are the arrow keys. The right stick is not a key: read it
 * with `rightStick`. Only pads with the standard mapping
 * count. Call `update` once per frame.
 */
export class GamepadReader {
  /** When each held control next repeats, by pad index and code. */
  private held = new Map<string, number>();

  update(
    pads: readonly (GamepadState | null)[],
    now: number,
    send: GamepadKey
  ): void {
    const seen = new Set<string>();
    for (const pad of pads) {
      if (!pad || pad.mapping !== 'standard') continue;
      for (const control of CONTROLS) {
        const id = `${pad.index} ${control.code}`;
        const next = this.held.get(id);
        if (!control.read(pad, next !== undefined)) continue;
        seen.add(id);
        const init = { key: control.key, code: control.code };
        if (next === undefined) {
          this.held.set(id, now + REPEAT_DELAY);
          send('down', init);
        } else if (control.repeats && now >= next) {
          this.held.set(id, now + REPEAT_INTERVAL);
          send('down', { ...init, repeat: true });
        }
      }
    }
    // A control that is no longer down, or whose pad is gone, comes up.
    for (const [id, next] of [...this.held]) {
      if (seen.has(id)) continue;
      this.held.delete(id);
      // A synced control never sent its down, so it sends no up.
      if (next === SYNCED) continue;
      const code = id.slice(id.indexOf(' ') + 1);
      const control = CONTROLS.find((c) => c.code === code)!;
      send('up', { key: control.key, code });
    }
  }

  /**
   * Takes the controls that are down now as held, with no keys and no
   * repeats, so they act only after they come up and go down again. They
   * send no up.
   */
  sync(pads: readonly (GamepadState | null)[]): void {
    this.held.clear();
    for (const pad of pads) {
      if (!pad || pad.mapping !== 'standard') continue;
      for (const control of CONTROLS)
        if (control.read(pad, false))
          this.held.set(`${pad.index} ${control.code}`, SYNCED);
    }
  }

  /**
   * The right stick's tilt on each axis, from -1 to 1, with the dead zone
   * cut out, so a stick at rest gives 0. With more than one pad, the pad
   * tilted most counts. The stick is not a key: it scrolls.
   */
  rightStick(pads: readonly (GamepadState | null)[]): { x: number; y: number } {
    let best = { x: 0, y: 0 };
    for (const pad of pads) {
      if (!pad || pad.mapping !== 'standard') continue;
      const x = deadZone(pad.axes[RIGHT_X] ?? 0);
      const y = deadZone(pad.axes[RIGHT_Y] ?? 0);
      if (Math.hypot(x, y) > Math.hypot(best.x, best.y)) best = { x, y };
    }
    return best;
  }

  /** Forgets every held control, with no up. */
  reset(): void {
    this.held.clear();
  }
}

/** Cuts out the dead zone and scales the rest back to the full range. */
function deadZone(value: number): number {
  const size = Math.abs(value);
  if (size <= RIGHT_DEAD_ZONE) return 0;
  return (Math.sign(value) * (size - RIGHT_DEAD_ZONE)) / (1 - RIGHT_DEAD_ZONE);
}
