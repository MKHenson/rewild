import { Transform } from 'rewild-renderer';
import { AnimationController } from '../../animation/AnimationController';
import { Asset3D } from '../Asset3D';
import { Animator } from './Animator';

function setup() {
  const controller = new AnimationController({
    clipNames: [],
    clipDuration: () => -1,
    fadeTo: () => false,
    stop: () => {},
    setClipRate: () => {},
    setClipTime: () => {},
    clipTime: () => -1,
  });
  const asset = new Asset3D(new Transform());
  const animator = new Animator(controller);
  const move = (x: number, z: number, dt: number) => {
    asset.transform.position.set(x, 0, z);
    asset.transform.updateMatrixWorld();
    animator.onUpdate(dt, 0, asset);
  };
  return { controller, animator, move };
}

describe('Animator', () => {
  it('measures ground speed from how far the asset moved', () => {
    const { controller, move } = setup();
    move(0, 0, 0.1);
    for (let i = 1; i <= 60; i++) move(i * 0.3, i * 0.4, 0.1);

    expect(controller.speed).toBeCloseTo(5);
  });

  it('starts from rest when mounted again', () => {
    const { controller, animator, move } = setup();
    move(0, 0, 0.1);
    move(10, 0, 0.1);
    animator.onMount();
    move(50, 0, 0.1);

    expect(controller.speed).toBe(0);
  });

  it('saves and restores the locomotion set', () => {
    const { controller, animator } = setup();
    controller.setLocomotion('injured', 0);
    const copy = setup();
    copy.animator.restore(animator.serialize());

    expect(copy.controller.locomotionSet).toBe('injured');
  });
});
