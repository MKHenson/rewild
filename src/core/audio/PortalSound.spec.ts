import { Vector3 } from 'rewild-common';
import type { Emitter } from 'rewild-audio';
import { REF_DISTANCE } from 'rewild-audio';
import {
  HUM_GAIN,
  HUM_OPEN_BOOST,
  OPEN_GAIN,
  PORTAL_HUM,
  PORTAL_OPEN,
  PORTAL_TRAVEL,
  PortalSound,
  humGain,
} from './PortalSound';

function setup() {
  const hum = { move: jest.fn(), set: jest.fn(), dispose: jest.fn() };
  const scope = {
    play: jest.fn(() => true),
    createEmitter: jest.fn(() => hum as unknown as Emitter),
  };
  const engine = { play: jest.fn(() => true) };
  return { hum, scope, engine, sound: new PortalSound(scope, engine) };
}

describe('humGain', () => {
  it('is HUM_GAIN for a portal no bigger than the reference distance', () => {
    expect(humGain(REF_DISTANCE)).toBeCloseTo(HUM_GAIN);
    expect(humGain(1)).toBeCloseTo(HUM_GAIN);
  });

  it('grows with the radius so the surface hears HUM_GAIN', () => {
    expect(humGain(6)).toBeGreaterThan(humGain(3));
    expect(humGain(3)).toBeGreaterThan(HUM_GAIN);
  });
});

describe('PortalSound', () => {
  it('plays the opening in 3D at the portal', () => {
    const { scope, sound } = setup();
    const at = new Vector3(1, 2, 3);
    sound.open(at);

    expect(scope.play).toHaveBeenCalledWith(
      PORTAL_OPEN,
      expect.objectContaining({ at, bus: 'effects', gain: OPEN_GAIN })
    );
    expect(scope.createEmitter).not.toHaveBeenCalled();
  });

  it('hums in 3D at the portal', () => {
    const { scope, sound } = setup();
    const at = new Vector3(1, 2, 3);
    sound.hum(at, 3);

    expect(scope.play).not.toHaveBeenCalled();
    expect(scope.createEmitter).toHaveBeenCalledWith(
      expect.objectContaining({
        sound: PORTAL_HUM,
        at,
        bus: 'effects',
        gain: humGain(3),
      })
    );
  });

  it('moves the hum rather than starting another', () => {
    const { hum, scope, sound } = setup();
    sound.hum(new Vector3(), 3);
    const moved = new Vector3(4, 5, 6);
    sound.hum(moved, 6);

    expect(scope.createEmitter).toHaveBeenCalledTimes(1);
    expect(hum.move).toHaveBeenCalledWith(moved);
    expect(hum.set).toHaveBeenCalledWith(humGain(6));
  });

  it('raises the hum as the portal opens', () => {
    const { hum, sound } = setup();
    sound.hum(new Vector3(), 3);
    sound.setOpenness(0.5);
    expect(hum.set).toHaveBeenLastCalledWith(
      humGain(3) * (1 + (HUM_OPEN_BOOST - 1) * 0.5)
    );
    sound.setOpenness(1);
    expect(hum.set).toHaveBeenLastCalledWith(humGain(3) * HUM_OPEN_BOOST);
  });

  it('leaves the hum alone while the openness holds', () => {
    const { hum, sound } = setup();
    sound.hum(new Vector3(), 3);
    sound.setOpenness(1);
    sound.setOpenness(1);
    expect(hum.set).toHaveBeenCalledTimes(1);
  });

  it('plays going through in 2D on the engine, not the scope', () => {
    const { scope, engine, sound } = setup();
    sound.travel();

    expect(engine.play).toHaveBeenCalledWith(PORTAL_TRAVEL, { bus: 'player' });
    expect(scope.play).not.toHaveBeenCalled();
  });

  it('stops the hum when disposed', () => {
    const { hum, sound } = setup();
    sound.hum(new Vector3(), 3);
    sound.dispose();
    sound.dispose();

    expect(hum.dispose).toHaveBeenCalledTimes(1);
  });
});
