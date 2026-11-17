import {
  Gamepad,
  GamepadButton,
  GamepadSnapshot,
  STICK_DEAD_ZONE,
} from './Gamepad';

function pad(
  pressed: GamepadButton[] = [],
  axes = [0, 0, 0, 0],
  mapping = 'standard'
): GamepadSnapshot {
  return {
    mapping,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressed.includes(i),
    })),
    axes,
  };
}

describe('Gamepad', () => {
  it('reports a press on the read where the button goes down', () => {
    const gamepad = new Gamepad();
    gamepad.update([pad([GamepadButton.A])]);
    expect(gamepad.pressed(GamepadButton.A)).toBe(true);
    gamepad.update([pad([GamepadButton.A])]);
    expect(gamepad.pressed(GamepadButton.A)).toBe(false);
    expect(gamepad.held(GamepadButton.A)).toBe(true);
    gamepad.update([pad()]);
    expect(gamepad.held(GamepadButton.A)).toBe(false);
  });

  it('reads the first pad with the standard mapping', () => {
    const gamepad = new Gamepad();
    gamepad.update([
      null,
      pad([GamepadButton.B], undefined, ''),
      pad([GamepadButton.Y]),
    ]);
    expect(gamepad.connected).toBe(true);
    expect(gamepad.held(GamepadButton.Y)).toBe(true);
    expect(gamepad.held(GamepadButton.B)).toBe(false);
    gamepad.update([]);
    expect(gamepad.connected).toBe(false);
    expect(gamepad.held(GamepadButton.Y)).toBe(false);
  });

  it('centres a stick inside the dead zone', () => {
    const gamepad = new Gamepad();
    gamepad.update([pad([], [STICK_DEAD_ZONE * 0.9, 0, 0, -0.1])]);
    expect(gamepad.move).toEqual({ x: 0, y: 0 });
    expect(gamepad.look).toEqual({ x: 0, y: 0 });
  });

  it('scales a stick from the dead zone edge to a full push', () => {
    const gamepad = new Gamepad();
    gamepad.update([pad([], [0, 0, 1, 0])]);
    expect(gamepad.look.x).toBeCloseTo(1);
    const half = STICK_DEAD_ZONE + (1 - STICK_DEAD_ZONE) / 2;
    gamepad.update([pad([], [0, -half, 0, 0])]);
    expect(gamepad.move.y).toBeCloseTo(-0.5);
    // A corner push is no longer than a full push.
    gamepad.update([pad([], [1, 1, 0, 0])]);
    expect(Math.hypot(gamepad.move.x, gamepad.move.y)).toBeCloseTo(1);
  });
});
