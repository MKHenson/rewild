import { UIKeyboardInit } from './events';
import {
  GamepadReader,
  GamepadState,
  REPEAT_DELAY,
  REPEAT_INTERVAL,
} from './gamepad';

function pad(pressed: number[] = [], axes = [0, 0], index = 0): GamepadState {
  return {
    index,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressed.includes(i),
    })),
    axes,
  };
}

function reader() {
  const keys: string[] = [];
  const gamepad = new GamepadReader();
  const read = (pads: (GamepadState | null)[], now = 0) =>
    gamepad.update(pads, now, (action, init: UIKeyboardInit) =>
      keys.push(
        `${action} ${init.key} ${init.code}${init.repeat ? ' repeat' : ''}`
      )
    );
  return { keys, read };
}

describe('GamepadReader', () => {
  it('presses Enter for A and Escape for B, once each', () => {
    const { keys, read } = reader();
    read([pad([0])]);
    read([pad([0])], 1000);
    read([pad([])], 1100);
    read([pad([1])], 1200);
    expect(keys).toEqual([
      'down Enter GamepadA',
      'up Enter GamepadA',
      'down Escape GamepadB',
    ]);
  });

  it('presses an arrow for the d-pad, and repeats while held', () => {
    const { keys, read } = reader();
    read([pad([13])], 0);
    read([pad([13])], REPEAT_DELAY - 1);
    read([pad([13])], REPEAT_DELAY);
    read([pad([13])], REPEAT_DELAY + REPEAT_INTERVAL);
    expect(keys).toEqual([
      'down ArrowDown GamepadDpadDown',
      'down ArrowDown GamepadDpadDown repeat',
      'down ArrowDown GamepadDpadDown repeat',
    ]);
  });

  it('reads the stick on its stronger axis, with a dead zone', () => {
    const { keys, read } = reader();
    read([pad([], [0.4, 0])]);
    expect(keys).toEqual([]);
    read([pad([], [0.6, 0.7])]);
    expect(keys).toEqual(['down ArrowDown GamepadStickDown']);
  });

  it('holds the stick until it comes back past the lower value', () => {
    const { keys, read } = reader();
    read([pad([], [-0.8, 0])], 0);
    read([pad([], [-0.35, 0])], 10);
    expect(keys).toEqual(['down ArrowLeft GamepadStickLeft']);
    read([pad([], [-0.2, 0])], 20);
    expect(keys.at(-1)).toBe('up ArrowLeft GamepadStickLeft');
  });

  it('lifts held controls when the pad goes', () => {
    const { keys, read } = reader();
    read([pad([0])]);
    read([null]);
    expect(keys).toEqual(['down Enter GamepadA', 'up Enter GamepadA']);
  });

  it('ignores a pad without the standard mapping', () => {
    const { keys, read } = reader();
    read([{ ...pad([0]), mapping: '' }]);
    expect(keys).toEqual([]);
  });
});

describe('GamepadReader sync', () => {
  it('holds what is down with no keys, until it comes up and goes down again', () => {
    const keys: string[] = [];
    const gamepad = new GamepadReader();
    gamepad.sync([pad([1, 13])]);
    const send = (pads: GamepadState[], now: number) =>
      gamepad.update(pads, now, (action, init) =>
        keys.push(`${action} ${init.key}${init.repeat ? ' repeat' : ''}`)
      );
    send([pad([1, 13])], 0);
    send([pad([1, 13])], REPEAT_DELAY * 10);
    send([pad([])], REPEAT_DELAY * 11);
    send([pad([1])], REPEAT_DELAY * 12);
    expect(keys).toEqual(['down Escape']);
  });
});
