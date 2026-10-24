import { ICreatureAnimation } from 'models';
import { GltfClip, GltfSkeleton } from 'rewild-renderer/lib/core/GltfSkeleton';
import { ClipPlayer } from 'rewild-renderer/lib/renderers/skinning/ClipPlayer';
import { PoseStore } from 'rewild-renderer/lib/renderers/skinning/PoseStore';
import {
  AnimationController,
  AnimationTarget,
  RATE_CORRECTION,
} from './AnimationController';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function skeleton(): GltfSkeleton {
  return {
    names: ['hip'],
    parents: new Int32Array([-1]),
    translations: new Float32Array([0, 0, 0]),
    rotations: new Float32Array([0, 0, 0, 1]),
    scales: new Float32Array([1, 1, 1]),
    inverseBindMatrices: new Float32Array(IDENTITY),
    rootMatrix: new Float32Array(IDENTITY),
  };
}

/** Holds the hip's x at `x` for `duration` seconds. */
function clip(name: string, duration: number, x: number): GltfClip {
  return {
    name,
    duration,
    channels: [
      {
        joint: 0,
        path: 'translation',
        interpolation: 'LINEAR',
        times: new Float32Array([0, duration]),
        values: new Float32Array([x, 0, 0, x, 0, 0]),
      },
    ],
  };
}

class Target implements AnimationTarget {
  constructor(readonly player: ClipPlayer, readonly handle: number) {}
  get clipNames() {
    return this.player.clips.map((c) => c.name);
  }
  clipDuration(c: string) {
    return this.player.duration(c);
  }
  fadeTo(c: string, w: number, fade?: number, loop?: boolean) {
    return this.player.fadeTo(this.handle, c, w, fade, loop);
  }
  stop(c: string, fade?: number) {
    this.player.stop(this.handle, c, fade);
  }
  setClipRate(c: string, rate: number) {
    this.player.setRate(this.handle, c, rate);
  }
  setClipTime(c: string, seconds: number) {
    this.player.setTime(this.handle, c, seconds);
  }
  clipTime(c: string) {
    return this.player.timeOf(this.handle, c);
  }
}

const CHICKEN: ICreatureAnimation = {
  clipSpeeds: { walk: 1.2, run: 4, limp: 0.6 },
  locomotion: { injured: { walk: 'limp' } },
};

function setup(
  config: ICreatureAnimation = CHICKEN,
  clips = [
    clip('idle', 2, 0),
    clip('walk', 1, 1),
    clip('run', 0.5, 2),
    clip('limp', 1.2, 3),
    clip('eat', 1, 10),
  ],
  random = () => 0.5
) {
  const poses = new PoseStore(skeleton());
  const player = new ClipPlayer(poses, clips);
  const handle = poses.add();
  const controller = new AnimationController(
    new Target(player, handle),
    config,
    random
  );
  const step = (dt: number) => {
    controller.update(dt);
    player.update(dt);
  };
  const weight = (c: string) => player.weightOf(handle, c);
  const time = (c: string) => player.timeOf(handle, c);
  const hipX = () => poses.pose[poses.poseOffset(handle)];
  return { controller, player, step, weight, time, hipX };
}

describe('AnimationController', () => {
  it('plays all idle at zero speed', () => {
    const { controller, step, weight } = setup();
    controller.start();
    step(0.1);

    expect(weight('idle')).toBeCloseTo(1);
    expect(weight('walk')).toBe(0);
  });

  it('starts idle at a random point in its loop', () => {
    const { controller, time } = setup();
    controller.start();

    expect(time('idle')).toBeCloseTo(1);
  });

  it('blends walk and run by speed', () => {
    const { controller, step, weight } = setup();
    controller.speed = 2.6;
    step(0.1);

    expect(weight('walk')).toBeCloseTo(0.5);
    expect(weight('run')).toBeCloseTo(0.5);
    expect(weight('idle')).toBe(0);
  });

  it('keeps walk and run on one cycle', () => {
    const { controller, step, time } = setup();
    controller.speed = 2;
    for (let i = 0; i < 7; i++) step(0.13);

    expect(time('walk') / 1).toBeCloseTo(time('run') / 0.5);
  });

  it('plays a clip at its natural rate at its natural speed', () => {
    const { controller, step, time } = setup();
    controller.speed = 1.2;
    step(0.1);
    step(0.2);

    expect(time('walk')).toBeCloseTo(0.3);
  });

  it('corrects the rate a little past the fastest clip, and no more', () => {
    const fast = setup();
    fast.controller.speed = 4.4;
    fast.step(0.1);
    expect(fast.time('run')).toBeCloseTo(0.1 * 1.1);

    const faster = setup();
    faster.controller.speed = 40;
    faster.step(0.1);
    expect(faster.time('run')).toBeCloseTo(0.1 * (1 + RATE_CORRECTION));
  });

  it('speeds up from idle to run with no pop', () => {
    const { controller, step, hipX, weight } = setup();
    controller.start();
    step(0);

    let last = hipX();
    for (let speed = 0; speed <= 4; speed += 0.05) {
      controller.speed = speed;
      step(1 / 60);
      expect(Math.abs(hipX() - last)).toBeLessThan(0.05);
      expect(weight('idle') + weight('walk') + weight('run')).toBeCloseTo(1);
      last = hipX();
    }
    expect(weight('run')).toBeCloseTo(1);
  });

  it('swaps walk for limp in the injured set and keeps the normal run', () => {
    const { controller, step, weight } = setup();
    controller.setLocomotion('injured', 0);

    controller.speed = 0.6;
    step(0.1);
    expect(weight('limp')).toBeCloseTo(1);

    controller.speed = 4;
    step(0.1);
    expect(weight('run')).toBeCloseTo(1);
    expect(controller.locomotionSet).toBe('injured');
  });

  it('crossfades between sets', () => {
    const { controller, step, weight } = setup();
    controller.speed = 1.2;
    step(0.1);

    controller.setLocomotion('injured', 0.4);
    step(0.2);
    expect(weight('walk')).toBeCloseTo(0.5);
    expect(weight('walk') + weight('limp') + weight('run')).toBeCloseTo(1);

    step(0.3);
    expect(weight('walk')).toBe(0);
  });

  it('walks normally in a set the creature does not have', () => {
    const { controller, step, weight } = setup();
    controller.setLocomotion('tired', 0);
    controller.speed = 1.2;
    step(0.1);

    expect(weight('walk')).toBeCloseTo(1);
  });

  it('fades an action in over locomotion and out as it ends', () => {
    const { controller, step, weight } = setup();
    controller.speed = 1.2;
    step(0.1);

    expect(controller.play('eat')).toBe(true);
    step(0.125);
    expect(weight('eat')).toBeCloseTo(0.5);
    expect(weight('eat') + weight('walk')).toBeCloseTo(1);

    step(0.2);
    expect(weight('eat')).toBeCloseTo(1);
    expect(controller.isPlaying('eat')).toBe(true);

    for (let i = 0; i < 20; i++) step(0.05);
    expect(controller.isPlaying('eat')).toBe(false);
    expect(weight('eat')).toBe(0);
    expect(weight('walk')).toBeCloseTo(1);
  });

  it('stops an action when asked', () => {
    const { controller, step, weight } = setup();
    controller.play('eat', true);
    step(0.5);

    controller.stop('eat', 0.2);
    expect(controller.isPlaying('eat')).toBe(false);
    step(0.1);
    expect(weight('eat')).toBeCloseTo(0.5);
    step(0.2);
    expect(weight('eat')).toBe(0);
    expect(weight('idle')).toBeCloseTo(1);
  });

  it('refuses an action the creature has no clip for', () => {
    const { controller } = setup();
    expect(controller.play('fly')).toBe(false);
  });

  it('maps meanings to clips and falls back to a name of any case', () => {
    const { controller, step, weight } = setup({ clips: { eat: 'Peck' } }, [
      clip('Idle', 1, 0),
      clip('Walk', 1, 1),
      clip('Peck', 1, 2),
    ]);

    expect(controller.resolveClip('idle')).toBe('Idle');
    expect(controller.resolveClip('eat')).toBe('Peck');
    expect(controller.resolveClip('run')).toBeNull();

    controller.speed = 0;
    step(0.1);
    expect(weight('Idle')).toBeCloseTo(1);
  });

  it('plays an idle action now and then while standing still', () => {
    const { controller, step, weight } = setup({
      ...CHICKEN,
      idleActions: ['eat'],
    });
    controller.start();

    for (let i = 0; i < 75; i++) step(0.1);
    expect(controller.isPlaying('eat')).toBe(true);

    controller.speed = 1.2;
    for (let i = 0; i < 5; i++) step(0.1);
    expect(controller.isPlaying('eat')).toBe(false);
    expect(weight('eat')).toBe(0);
  });

  it('plays no idle action while moving', () => {
    const { controller, step } = setup({ ...CHICKEN, idleActions: ['eat'] });
    controller.speed = 1.2;

    for (let i = 0; i < 200; i++) step(0.1);
    expect(controller.isPlaying('eat')).toBe(false);
  });
});
