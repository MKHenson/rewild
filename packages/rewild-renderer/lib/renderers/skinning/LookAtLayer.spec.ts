import { GltfClip, GltfSkeleton } from '../../core/GltfSkeleton';
import { ClipPlayer } from './ClipPlayer';
import { LookAtLayer } from './LookAtLayer';
import { PoseStore } from './PoseStore';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const S = Math.SQRT1_2;

/**
 * Root turned −90° about x with scale 0.01 on the armature, like a rig exported
 * with its up axis swapped. Its local −y is model forward (+Z). Joint matrices
 * read as joint-to-model, since the inverse binds are identity.
 */
function skeleton(): GltfSkeleton {
  return {
    names: ['root', 'neck', 'neck1', 'head', 'tail'],
    parents: new Int32Array([-1, 0, 1, 2, 0]),
    translations: new Float32Array([
      0, 0, 0, 0, -10, 0, 0, -10, 0, 0, -10, 0, 0, 10, 0,
    ]),
    rotations: new Float32Array([
      -S,
      0,
      0,
      S,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
    ]),
    scales: new Float32Array(15).fill(1),
    inverseBindMatrices: new Float32Array(
      Array.from({ length: 5 }, () => IDENTITY).flat()
    ),
    rootMatrix: new Float32Array([
      0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 1,
    ]),
  };
}

/** A clip that lifts the head joint's local rotation a little. */
function nod(): GltfClip {
  const sin = Math.sin(0.1);
  const cos = Math.cos(0.1);
  return {
    name: 'nod',
    duration: 1,
    channels: [
      {
        joint: 3,
        path: 'rotation',
        interpolation: 'LINEAR',
        times: new Float32Array([0, 1]),
        values: new Float32Array([sin, 0, 0, cos, sin, 0, 0, cos]),
      },
    ],
  };
}

function setup() {
  const poses = new PoseStore(skeleton());
  const player = new ClipPlayer(poses, [nod()]);
  const layer = new LookAtLayer(poses, player);
  layer.setChain(['neck', 'neck1', 'head']);
  const frame = () => {
    player.update(1 / 60);
    layer.apply();
    poses.update();
  };
  const add = (playing = true) => {
    const handle = poses.add();
    if (playing) player.play(handle, 'nod');
    return handle;
  };
  return { poses, player, layer, frame, add };
}

/** Model-space direction of a joint's local −y, which is forward at rest. */
function forwardOf(poses: PoseStore, slot: number, joint: number): number[] {
  const o = (slot * poses.jointCount + joint) * 16 + 4;
  const m = poses.jointMatrices;
  const length = Math.hypot(m[o], m[o + 1], m[o + 2]);
  return [-m[o] / length, -m[o + 1] / length, -m[o + 2] / length];
}

function direction(yaw: number, pitch: number): number[] {
  return [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ];
}

function expectVector(actual: number[], expected: number[]) {
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 4));
}

/** The head's forward with the clip's 0.2 rad nod about model x. */
const NODDED = [0, -Math.sin(0.2), Math.cos(0.2)];

describe('LookAtLayer', () => {
  it('finds the head in model space through the armature scale', () => {
    const { layer } = setup();

    expect(layer.origin.x).toBeCloseTo(0);
    expect(layer.origin.y).toBeCloseTo(0);
    expect(layer.origin.z).toBeCloseTo(0.3);
  });

  it('points the head by the whole yaw and pitch', () => {
    const { poses, layer, frame, add } = setup();
    add();
    const yaw = 0.7;
    const pitch = 0.4;
    layer.set(0, yaw, pitch, 1);
    frame();

    // With the nod at zero the head would point at direction(yaw, pitch).
    const c = Math.cos(pitch);
    const s = Math.sin(pitch);
    const y = NODDED[1] * c + NODDED[2] * s;
    const z = -NODDED[1] * s + NODDED[2] * c;
    expectVector(forwardOf(poses, 0, 3), [
      Math.sin(yaw) * z,
      y,
      Math.cos(yaw) * z,
    ]);
  });

  it('gives the head the largest share and the neck the rest', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.set(0, 0.8, 0, 1);
    frame();

    expectVector(forwardOf(poses, 0, 1), direction(0.2, 0));
    expectVector(forwardOf(poses, 0, 2), direction(0.4, 0));
    const head = forwardOf(poses, 0, 3);
    expect(Math.atan2(head[0], head[2])).toBeCloseTo(0.8, 4);
  });

  it('leaves bones off the chain alone', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.set(0, 0.8, 0.3, 1);
    frame();

    expectVector(forwardOf(poses, 0, 4), direction(0, 0));
  });

  it('scales the turn by the weight', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.set(0, 0.8, 0, 0.5);
    frame();

    const head = forwardOf(poses, 0, 3);
    expect(Math.atan2(head[0], head[2])).toBeCloseTo(0.4, 4);
  });

  it('does not build up from frame to frame', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.set(0, 0.8, 0.2, 1);
    frame();
    const first = forwardOf(poses, 0, 3);
    for (let i = 0; i < 10; i++) frame();

    expectVector(forwardOf(poses, 0, 3), first);
  });

  it('returns to the clip when the weight falls to 0', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.set(0, 0.8, 0.2, 1);
    frame();
    layer.set(0, 0.8, 0.2, 0);
    frame();

    expectVector(forwardOf(poses, 0, 3), NODDED);
  });

  it('skips a slot with no clip, whose pose nothing rewrites', () => {
    const { poses, layer, frame, add } = setup();
    add(false);
    layer.set(0, 0.8, 0, 1);
    frame();
    frame();

    expectVector(forwardOf(poses, 0, 3), direction(0, 0));
  });

  it('turns each slot by its own values', () => {
    const { poses, layer, frame, add } = setup();
    add();
    add();
    layer.set(0, 0.8, 0, 1);
    layer.set(1, -0.5, 0, 1);
    frame();

    const a = forwardOf(poses, 0, 3);
    const b = forwardOf(poses, 1, 3);
    expect(Math.atan2(a[0], a[2])).toBeCloseTo(0.8, 4);
    expect(Math.atan2(b[0], b[2])).toBeCloseTo(-0.5, 4);
  });

  it('moves a slot with swap-remove and clears a reused one', () => {
    const { poses, layer, frame, add } = setup();
    const a = add();
    add();
    layer.set(1, -0.5, 0, 1);

    poses.remove(a);
    frame();
    const moved = forwardOf(poses, 0, 3);
    expect(Math.atan2(moved[0], moved[2])).toBeCloseTo(-0.5, 4);

    add();
    frame();
    expectVector(forwardOf(poses, 1, 3), NODDED);
  });

  it('keeps its values when the store grows', () => {
    const poses = new PoseStore(skeleton(), 1);
    const player = new ClipPlayer(poses, [nod()]);
    const layer = new LookAtLayer(poses, player);
    layer.setChain(['head']);
    player.play(poses.add(), 'nod');
    layer.set(0, 0.6, 0, 1);
    player.play(poses.add(), 'nod');

    player.update(1 / 60);
    layer.apply();
    poses.update();

    const head = forwardOf(poses, 0, 3);
    expect(Math.atan2(head[0], head[2])).toBeCloseTo(0.6, 4);
  });

  it('accepts the same chain again and refuses another', () => {
    const { layer } = setup();

    expect(() => layer.setChain(['neck', 'neck1', 'head'])).not.toThrow();
    expect(() => layer.setChain(['head'])).toThrow(/differs/);
  });

  it('refuses a bone the skeleton lacks or a chain out of order', () => {
    const fresh = () => {
      const poses = new PoseStore(skeleton());
      return new LookAtLayer(poses, new ClipPlayer(poses, []));
    };

    expect(() => fresh().setChain(['wing'])).toThrow(/does not exist/);
    expect(() => fresh().setChain(['head', 'neck'])).toThrow(/parent first/);
    expect(() => fresh().setChain(['tail', 'head'])).toThrow(/parent first/);
    expect(() => fresh().setChain([])).toThrow(/empty/);
  });

  it('does nothing without a chain', () => {
    const poses = new PoseStore(skeleton());
    const player = new ClipPlayer(poses, [nod()]);
    const layer = new LookAtLayer(poses, player);
    player.play(poses.add(), 'nod');
    layer.set(0, 0.8, 0, 1);

    player.update(1 / 60);
    layer.apply();
    poses.update();

    expectVector(forwardOf(poses, 0, 3), NODDED);
  });
});
