import { GltfClip, GltfSkeleton } from '../../core/GltfSkeleton';
import { ClipPlayer, MAX_LAYERS } from './ClipPlayer';
import { POSE_STRIDE, PoseStore } from './PoseStore';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** hip at (0, 1, 0), leg 0.5 below it. */
function skeleton(): GltfSkeleton {
  return {
    names: ['hip', 'leg'],
    parents: new Int32Array([-1, 0]),
    translations: new Float32Array([0, 1, 0, 0, -0.5, 0]),
    rotations: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
    scales: new Float32Array([1, 1, 1, 1, 1, 1]),
    inverseBindMatrices: new Float32Array([...IDENTITY, ...IDENTITY]),
    rootMatrix: new Float32Array(IDENTITY),
  };
}

/** Moves the hip's x from `from` to `to` over one second. */
function slide(name: string, from: number, to: number): GltfClip {
  return {
    name,
    duration: 1,
    channels: [
      {
        joint: 0,
        path: 'translation',
        interpolation: 'LINEAR',
        times: new Float32Array([0, 1]),
        values: new Float32Array([from, 1, 0, to, 1, 0]),
      },
    ],
  };
}

/** Turns the leg 0 to 180 degrees about z over one second. */
function turn(): GltfClip {
  const s = Math.SQRT1_2;
  return {
    name: 'turn',
    duration: 1,
    channels: [
      {
        joint: 1,
        path: 'rotation',
        interpolation: 'LINEAR',
        times: new Float32Array([0, 0.5, 1]),
        values: new Float32Array([0, 0, 0, 1, 0, 0, s, s, 0, 0, 1, 0]),
      },
    ],
  };
}

function setup(clips: GltfClip[] = [slide('idle', 0, 0), slide('walk', 0, 2)]) {
  const poses = new PoseStore(skeleton());
  const player = new ClipPlayer(poses, clips);
  return { poses, player };
}

function hipX(poses: PoseStore, handle: number): number {
  return poses.pose[poses.poseOffset(handle)];
}

function legRotation(poses: PoseStore, handle: number): number[] {
  const o = poses.poseOffset(handle) + POSE_STRIDE + 3;
  return Array.from(poses.pose.subarray(o, o + 4));
}

describe('ClipPlayer', () => {
  it('samples a clip between its keys', () => {
    const { poses, player } = setup();
    const handle = poses.add();

    player.play(handle, 'walk');
    player.update(0.25);

    expect(hipX(poses, handle)).toBeCloseTo(0.5);
  });

  it('plays each instance at its own time', () => {
    const { poses, player } = setup();
    const a = poses.add();
    const b = poses.add();

    player.play(a, 'walk');
    player.play(b, 'walk');
    player.setTime(b, 'walk', 0.5);
    player.update(0.1);

    expect(hipX(poses, a)).toBeCloseTo(0.2);
    expect(hipX(poses, b)).toBeCloseTo(1.2);
  });

  it('loops, and holds the last key when not looping', () => {
    const { poses, player } = setup();
    const a = poses.add();
    const b = poses.add();

    player.play(a, 'walk');
    player.play(b, 'walk', 0, false);
    player.update(1.25);

    expect(hipX(poses, a)).toBeCloseTo(0.5);
    expect(hipX(poses, b)).toBeCloseTo(2);
  });

  it('scales time by the rate, backwards too', () => {
    const { poses, player } = setup();
    const handle = poses.add();

    player.play(handle, 'walk');
    player.setRate(handle, 'walk', -2);
    player.update(0.1);

    expect(player.timeOf(handle, 'walk')).toBeCloseTo(0.8);
    expect(hipX(poses, handle)).toBeCloseTo(1.6);
  });

  it('holds each key until the next on a step channel', () => {
    const clip = slide('step', 0, 2);
    clip.channels[0].interpolation = 'STEP';
    const { poses, player } = setup([clip]);
    const handle = poses.add();

    player.play(handle, 'step');
    player.update(0.9);

    expect(hipX(poses, handle)).toBeCloseTo(0);
  });

  it('slerps rotation keys', () => {
    const { poses, player } = setup([turn()]);
    const handle = poses.add();

    player.play(handle, 'turn');
    player.update(0.25);

    const half = Math.PI / 8;
    const q = legRotation(poses, handle);
    expect(q[2]).toBeCloseTo(Math.sin(half));
    expect(q[3]).toBeCloseTo(Math.cos(half));
  });

  it('crossfades with no pop and keeps the total weight at 1', () => {
    const { poses, player } = setup([slide('idle', 1, 1), slide('walk', 3, 3)]);
    const handle = poses.add();

    player.play(handle, 'idle');
    player.update(0.1);
    expect(hipX(poses, handle)).toBeCloseTo(1);

    player.play(handle, 'walk', 0.4);
    let last = hipX(poses, handle);
    for (let frame = 0; frame < 4; frame++) {
      player.update(0.1);
      const x = hipX(poses, handle);
      expect(x - last).toBeCloseTo(0.5);
      expect(
        player.weightOf(handle, 'idle') + player.weightOf(handle, 'walk')
      ).toBeCloseTo(1);
      last = x;
    }

    expect(hipX(poses, handle)).toBeCloseTo(3);
    player.update(0.1);
    expect(player.timeOf(handle, 'idle')).toBe(-1);
  });

  it('keeps a crossfade target playing from its own time', () => {
    const { poses, player } = setup();
    const handle = poses.add();

    player.play(handle, 'walk');
    player.update(0.3);
    player.play(handle, 'idle', 0.2);
    player.play(handle, 'walk', 0.2);
    player.update(0.1);

    expect(player.timeOf(handle, 'walk')).toBeCloseTo(0.4);
  });

  it('blends rotations on the short arc', () => {
    // The rest rotation keyed as its negated quaternion: the same orientation.
    const flipped: GltfClip = {
      name: 'flipped',
      duration: 1,
      channels: [
        {
          joint: 1,
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 1]),
          values: new Float32Array([0, 0, 0, -1, 0, 0, 0, -1]),
        },
      ],
    };
    const { poses, player } = setup([flipped]);
    const handle = poses.add();

    player.fadeTo(handle, 'flipped', 0.5);
    player.update(0);

    const q = legRotation(poses, handle);
    expect(Math.abs(q[3])).toBeCloseTo(1);
  });

  it('settles into the rest pose when the last clip fades out', () => {
    const { poses, player } = setup();
    const handle = poses.add();

    player.play(handle, 'walk');
    player.update(0.5);
    player.stop(handle, 'walk', 0.2);
    player.update(0.1);
    expect(hipX(poses, handle)).toBeGreaterThan(0);

    player.update(0.1);
    expect(hipX(poses, handle)).toBeCloseTo(0);
    expect(player.timeOf(handle, 'walk')).toBe(-1);
  });

  it('normalises weights that sum over 1', () => {
    const { poses, player } = setup([slide('a', 1, 1), slide('b', 3, 3)]);
    const handle = poses.add();

    player.fadeTo(handle, 'a', 1);
    player.fadeTo(handle, 'b', 1);
    player.update(0);

    expect(hipX(poses, handle)).toBeCloseTo(2);
  });

  it('replaces the weakest layer when every layer is in use', () => {
    const clips = Array.from({ length: MAX_LAYERS + 1 }, (_, i) =>
      slide(`c${i}`, i, i)
    );
    const { poses, player } = setup(clips);
    const handle = poses.add();

    for (let i = 0; i < MAX_LAYERS; i++)
      player.fadeTo(handle, `c${i}`, i === 2 ? 0.1 : 1);
    player.fadeTo(handle, `c${MAX_LAYERS}`, 1);

    expect(player.weightOf(handle, 'c2')).toBe(0);
    expect(player.weightOf(handle, `c${MAX_LAYERS}`)).toBe(1);
  });

  it('moves playback with a pose when a removal moves its slot', () => {
    const { poses, player } = setup();
    const a = poses.add();
    const b = poses.add();

    player.play(b, 'walk');
    player.setTime(b, 'walk', 0.5);
    poses.remove(a);
    player.update(0.1);

    expect(player.timeOf(b, 'walk')).toBeCloseTo(0.6);
    expect(hipX(poses, b)).toBeCloseTo(1.2);
  });

  it('starts a new instance with no clips in a reused slot', () => {
    const { poses, player } = setup();
    const a = poses.add();
    player.play(a, 'walk');
    poses.remove(a);

    const b = poses.add();
    player.update(0.5);

    expect(player.timeOf(b, 'walk')).toBe(-1);
    expect(hipX(poses, b)).toBe(0);
  });

  it('keeps playback when the store grows', () => {
    const poses = new PoseStore(skeleton(), 1);
    const player = new ClipPlayer(poses, [slide('walk', 0, 2)]);
    const a = poses.add();
    player.play(a, 'walk');
    player.setTime(a, 'walk', 0.5);
    poses.add();
    poses.add();

    expect(player.timeOf(a, 'walk')).toBeCloseTo(0.5);
  });

  it('refuses a clip the model does not have', () => {
    const { poses, player } = setup();
    const handle = poses.add();

    expect(player.play(handle, 'fly')).toBe(false);
    expect(player.hasClip('walk')).toBe(true);
  });

  it('leaves poses alone and unflagged while nothing plays', () => {
    const { poses, player } = setup();
    const handle = poses.add();
    poses.update();
    poses.pose[poses.poseOffset(handle)] = 5;

    player.update(0.1);

    expect(hipX(poses, handle)).toBe(5);
    expect(poses.update()).toBe(false);
  });
});
