/** Button indices in the standard mapping. */
export enum GamepadButton {
  A = 0,
  B = 1,
  X = 2,
  Y = 3,
  LeftBumper = 4,
  RightBumper = 5,
  LeftTrigger = 6,
  RightTrigger = 7,
  Back = 8,
  Start = 9,
  LeftStick = 10,
  RightStick = 11,
  DpadUp = 12,
  DpadDown = 13,
  DpadLeft = 14,
  DpadRight = 15,
}

/** The parts of a DOM `Gamepad` this reads. */
export interface GamepadSnapshot {
  readonly mapping: string;
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

export interface Stick {
  /** -1 is left and 1 is right. */
  x: number;
  /** -1 is up and 1 is down, as the DOM gives it. */
  y: number;
}

/** A stick pushed less than this reads as centred. */
export const STICK_DEAD_ZONE = 0.15;

/**
 * The game's gamepad. It reads the pads once per frame, so the game and the
 * UI see the same state, and one owner decides which of them acts on it.
 * Only the first pad with the standard mapping counts.
 */
export class Gamepad {
  /** The pads from the last read, for the UI. */
  pads: readonly (globalThis.Gamepad | null)[] = [];
  /** The left stick, past the dead zone. */
  readonly move: Stick = { x: 0, y: 0 };
  /** The right stick, past the dead zone. */
  readonly look: Stick = { x: 0, y: 0 };
  private down: boolean[] = [];
  private wasDown: boolean[] = [];
  private _connected = false;

  /** True when the last read found a pad with the standard mapping. */
  get connected(): boolean {
    return this._connected;
  }

  /** Reads the browser's pads. Call it once per frame. */
  poll(): void {
    const pads = navigator.getGamepads?.() ?? [];
    this.pads = pads;
    this.update(pads);
  }

  /** Reads a set of pads, as `poll` does. */
  update(pads: readonly (GamepadSnapshot | null)[]): void {
    const pad = pads.find((p) => p?.mapping === 'standard') ?? null;
    this._connected = pad !== null;
    [this.wasDown, this.down] = [this.down, this.wasDown];
    this.down.length = 0;
    if (pad) for (const button of pad.buttons) this.down.push(button.pressed);
    readStick(pad?.axes[0] ?? 0, pad?.axes[1] ?? 0, this.move);
    readStick(pad?.axes[2] ?? 0, pad?.axes[3] ?? 0, this.look);
  }

  /** True while the button is down. */
  held(button: GamepadButton): boolean {
    return this.down[button] ?? false;
  }

  /** True on the read where the button went down. */
  pressed(button: GamepadButton): boolean {
    return this.held(button) && !(this.wasDown[button] ?? false);
  }
}

/**
 * Writes the stick's position past a round dead zone, scaled so the edge of
 * the dead zone is 0 and a full push is 1.
 */
function readStick(x: number, y: number, out: Stick): void {
  const length = Math.hypot(x, y);
  if (length <= STICK_DEAD_ZONE) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const scale =
    Math.min(1, (length - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE)) / length;
  out.x = x * scale;
  out.y = y * scale;
}
