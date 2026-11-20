import { UIInput } from '../UIInput';
import { UIChild } from '../UINode';
import { UISurface, UISurfaceOptions } from '../UISurface';

/** Test helpers for components. The package index does not export them. */

export const MOUSE = { pointerId: 1, pointerType: 'mouse' as const, button: 0 };

/** Standard mapping button indices. */
export const PAD = { A: 0, B: 1, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

/**
 * A menu surface that takes all input, with the children in a column at its
 * top left, and the input over it and the surfaces a component makes.
 */
export function formSetup(...children: UIChild[]) {
  const surfaces: UISurface[] = [];
  const ui = {
    createSurface(options: UISurfaceOptions) {
      const surface = new UISurface(options);
      surfaces.push(surface);
      return surface;
    },
  };
  const menu = ui.createSurface({ kind: 'screen', name: 'menu', input: 'all' });
  menu.root.style.flexDirection = 'column';
  menu.root.style.alignItems = 'flex-start';
  menu.root.append(...children);
  const input = new UIInput({ surfaces });
  const update = () => {
    for (const surface of surfaces) surface.update(400, 300);
  };
  let now = 0;
  /** Presses and releases gamepad buttons, one at a time. */
  const pad = (...buttons: number[]) => {
    for (const index of buttons) {
      input.readGamepads([gamepad([index])], (now += 1000));
      input.readGamepads([gamepad([])], (now += 16));
      update();
    }
  };
  const key = (key: string, init: { shiftKey?: boolean } = {}) => {
    input.key('down', { key, code: key, ...init });
    input.key('up', { key, code: key, ...init });
    update();
  };
  const click = (x: number, y: number) => {
    input.pointer('down', { ...MOUSE, x, y });
    input.pointer('up', { ...MOUSE, x, y });
    update();
  };
  return { ui, menu, input, update, pad, key, click };
}

export function gamepad(pressed: number[]): Gamepad {
  return {
    index: 0,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressed.includes(i),
    })),
    axes: [0, 0],
  } as unknown as Gamepad;
}
