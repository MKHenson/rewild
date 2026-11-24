import { focusableAncestor } from './focus';
import type { UIInput } from './UIInput';
import { UINode } from './UINode';
import type { UISurface, UISurfaceOptions } from './UISurface';
import type { UIVector3 } from './world';

/** The look-at ray's pointer id. A DOM pointer's id is positive, and a key's click is -1. */
export const LOOK_POINTER_ID = -2;

/** Metres the look-at ray reaches by default. */
export const DEFAULT_LOOK_REACH = 3;

/** The crosshair's width and height in CSS pixels. */
const CROSSHAIR_SIZE = 8;

/** Milliseconds the crosshair takes to fade in or out. */
const CROSSHAIR_FADE = 120;

/** What the look-at pointer needs from the UI: its input, and a surface for the crosshair. */
export interface UILookPointerHost {
  readonly input: UIInput;
  createSurface(options: UISurfaceOptions): UISurface;
}

export interface UILookPointerOptions {
  /** Metres. Defaults to 3. */
  reach?: number;
  /** The order of the crosshair's surface. Defaults to 0. */
  order?: number;
}

/**
 * The look-at pointer: a ray from the eye through the centre of the screen,
 * for world surfaces. While the ray points at a focusable node within reach,
 * such as a button, a crosshair shows in the centre of the screen and the
 * node gets the pointer's hover. A press while it shows clicks the node.
 *
 * The owner calls `aim` once per frame while the player looks round, and
 * `stop` when the player stops, such as when a menu opens. Each source of
 * presses has a name, such as `mouse`, `key` or `pad`. The pointer is down
 * while any of them holds it.
 */
export class UILookPointer {
  /** The screen surface the crosshair draws on. It takes no input. */
  readonly surface: UISurface;
  readonly crosshair: UINode;
  /** Metres. Past it, a world surface is only something to look at. */
  reach: number;
  private input: UIInput;
  private held = new Set<string>();
  private down = false;
  private aiming = false;
  private origin: UIVector3 = { x: 0, y: 0, z: 0 };
  private direction: UIVector3 = { x: 0, y: 0, z: -1 };
  /** The reach of the last aim, after the scene blocked it. */
  private lastReach = 0;

  constructor(host: UILookPointerHost, options: UILookPointerOptions = {}) {
    this.input = host.input;
    this.reach = options.reach ?? DEFAULT_LOOK_REACH;
    this.surface = host.createSurface({
      kind: 'screen',
      name: 'crosshair',
      order: options.order ?? 0,
      input: 'none',
    });
    Object.assign(this.surface.root.style, {
      justifyContent: 'center',
      alignItems: 'center',
    });
    this.crosshair = new UINode({
      name: 'crosshair',
      style: {
        width: CROSSHAIR_SIZE,
        height: CROSSHAIR_SIZE,
        borderRadius: CROSSHAIR_SIZE / 2,
        backgroundColor: '#ffffff',
        boxShadow: { blur: 4, color: '#00000099' },
        opacity: 0,
        transition: {
          property: 'opacity',
          duration: CROSSHAIR_FADE,
          easing: 'ease-out',
        },
      },
    });
    this.surface.root.append(this.crosshair);
  }

  /**
   * Points the ray from `origin` along `direction`, a unit vector in world
   * space. `blocked` is the distance to the nearest thing in the scene along
   * the ray, so a wall between the eye and a panel hides the panel.
   */
  aim(origin: UIVector3, direction: UIVector3, blocked = Infinity): void {
    copy(this.origin, origin);
    copy(this.direction, direction);
    this.lastReach = Math.min(this.reach, blocked);
    this.aiming = true;
    this.send('move');
    this.showCrosshair(this.down || this.target !== null);
  }

  /** The focusable node the ray points at, within reach, or null. */
  get target(): UINode | null {
    if (!this.aiming) return null;
    const node = this.input.pointerTarget(LOOK_POINTER_ID);
    return node && focusableAncestor(node);
  }

  /** True while a press holds the pointer down on a node. */
  get pressed(): boolean {
    return this.down;
  }

  /**
   * A press from `source`. It puts the pointer down when the ray points at a
   * focusable node, or when another source holds it down already. Returns
   * true when the UI took the press, so the game must not act on it.
   */
  press(source: string): boolean {
    if (this.held.has(source)) return true;
    if (!this.down) {
      if (!this.target) return false;
      this.down = true;
      this.send('down');
    }
    this.held.add(source);
    return true;
  }

  /** Ends the press from `source`. When no source holds the pointer, it comes up and clicks. */
  release(source: string): void {
    if (!this.held.delete(source) || this.held.size || !this.down) return;
    this.down = false;
    this.send('up');
  }

  /** Stops pointing. The node under the ray loses its hover and any press, with no click. */
  stop(): void {
    if (this.aiming) this.send('cancel');
    this.aiming = false;
    this.down = false;
    this.held.clear();
    this.showCrosshair(false);
  }

  private send(action: 'down' | 'move' | 'up' | 'cancel'): void {
    this.input.ray(action, {
      pointerId: LOOK_POINTER_ID,
      origin: this.origin,
      direction: this.direction,
      reach: this.lastReach,
      button: 0,
      buttons: this.down ? 1 : 0,
    });
  }

  private showCrosshair(visible: boolean): void {
    const opacity = visible ? 1 : 0;
    if (this.crosshair.style.opacity !== opacity)
      this.crosshair.style.opacity = opacity;
  }
}

function copy(out: UIVector3, v: UIVector3): void {
  out.x = v.x;
  out.y = v.y;
  out.z = v.z;
}
