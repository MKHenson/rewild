import { Vector3 } from 'rewild-common';
import { GltfClip, GltfSkeleton } from '../../core/GltfSkeleton';
import { ClipPlayer } from './ClipPlayer';
import { FootIKLayer } from './FootIKLayer';
import { PoseStore } from './PoseStore';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const NAMES = [
  'root',
  'pelvis',
  'upper.L',
  'lower.L',
  'end.L',
  'foot.L',
  'upper.R',
  'lower.R',
  'end.R',
  'foot.R',
  'spine',
];
const LEGS = [
  ['upper.L', 'lower.L', 'end.L', 'foot.L'],
  ['upper.R', 'lower.R', 'end.R', 'foot.R'],
];
const PELVIS = 1;
const UPPER_L = 2;
const LOWER_L = 3;
const END_L = 4;
const FOOT_L = 5;
const FOOT_R = 9;
const SPINE = 10;

/**
 * A biped standing with its pelvis 1 up and its feet on y = 0. Each knee bends
 * forward by 0.1. With `scale`, the armature scales the model and the joints
 * are as much longer, so model space stays the same.
 */
function skeleton(scale = 1, knee = 0.1): GltfSkeleton {
  const s = 1 / scale;
  const leg = (x: number) => [
    x,
    0,
    0,
    0,
    -0.5,
    knee,
    0,
    -0.5,
    -knee,
    0,
    0,
    0.1,
  ];
  const translations = [0, 0, 0, 0, 1, 0, ...leg(0.2), ...leg(-0.2), 0, 0.3, 0];
  const count = NAMES.length;
  return {
    names: NAMES,
    parents: new Int32Array([-1, 0, 1, 2, 3, 4, 1, 6, 7, 8, 1]),
    translations: new Float32Array(translations.map((v) => v * s)),
    rotations: new Float32Array(
      Array.from({ length: count }, () => [0, 0, 0, 1]).flat()
    ),
    scales: new Float32Array(count * 3).fill(1),
    inverseBindMatrices: new Float32Array(
      Array.from({ length: count }, () => IDENTITY).flat()
    ),
    rootMatrix: new Float32Array([
      scale,
      0,
      0,
      0,
      0,
      scale,
      0,
      0,
      0,
      0,
      scale,
      0,
      0,
      0,
      0,
      1,
    ]),
  };
}

const QUAD_NAMES = [
  'root',
  'pelvis',
  'chest',
  ...['BL', 'BR', 'FL', 'FR'].flatMap((leg) =>
    ['upper', 'lower', 'end', 'foot'].map((bone) => `${bone}.${leg}`)
  ),
];
const QUAD_LEGS = ['BL', 'BR', 'FL', 'FR'].map((leg) =>
  ['upper', 'lower', 'end', 'foot'].map((bone) => `${bone}.${leg}`)
);
const QUAD_PELVIS = 1;
const QUAD_CHEST = 2;
/** First joint of each quadruped leg: back left, back right, front left, front right. */
const QUAD_UPPER = [3, 7, 11, 15];

/**
 * A quadruped with its pelvis at (0, 1, -0.5) and its chest at (0, 1, 0.5).
 * The back legs hang from the pelvis and the front legs from the chest, at
 * x ±0.2, with the same bent shape as the biped's. Feet are on y = 0.
 */
function quadruped(): GltfSkeleton {
  const leg = (x: number) => [x, 0, 0, 0, -0.5, 0.1, 0, -0.5, -0.1, 0, 0, 0.1];
  const translations = [
    ...[0, 0, 0],
    ...[0, 1, -0.5],
    ...[0, 0, 1],
    ...leg(0.2),
    ...leg(-0.2),
    ...leg(0.2),
    ...leg(-0.2),
  ];
  const parents = [-1, 0, 1];
  for (const parent of [1, 1, 2, 2]) {
    const upper = parents.length;
    parents.push(parent, upper, upper + 1, upper + 2);
  }
  const count = QUAD_NAMES.length;
  return {
    names: QUAD_NAMES,
    parents: new Int32Array(parents),
    translations: new Float32Array(translations),
    rotations: new Float32Array(
      Array.from({ length: count }, () => [0, 0, 0, 1]).flat()
    ),
    scales: new Float32Array(count * 3).fill(1),
    inverseBindMatrices: new Float32Array(
      Array.from({ length: count }, () => IDENTITY).flat()
    ),
    rootMatrix: new Float32Array(IDENTITY),
  };
}

/** Holds a joint still, so the slot counts as playing. */
function stand(joint = SPINE): GltfClip {
  return {
    name: 'stand',
    duration: 1,
    channels: [
      {
        joint,
        path: 'rotation',
        interpolation: 'LINEAR',
        times: new Float32Array([0, 1]),
        values: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
      },
    ],
  };
}

function setup(rig = skeleton()) {
  const poses = new PoseStore(rig);
  const player = new ClipPlayer(poses, [stand()]);
  const layer = new FootIKLayer(poses, player);
  layer.setLegs(LEGS);
  const frame = () => {
    player.update(1 / 60);
    layer.apply();
    poses.update();
  };
  const add = (playing = true) => {
    const handle = poses.add();
    if (playing) player.play(handle, 'stand');
    return handle;
  };
  return { poses, player, layer, frame, add };
}

function positionOf(poses: PoseStore, slot: number, joint: number): number[] {
  const o = (slot * poses.jointCount + joint) * 16 + 12;
  const m = poses.jointMatrices;
  return [m[o], m[o + 1], m[o + 2]];
}

/** A joint's model-space axes, divided by its scale. */
function axesOf(poses: PoseStore, slot: number, joint: number): number[] {
  const o = (slot * poses.jointCount + joint) * 16;
  const m = Array.from(poses.jointMatrices.subarray(o, o + 11));
  const s = Math.hypot(m[0], m[1], m[2]);
  return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]].map(
    (v) => v / s
  );
}

function distance(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function expectVector(actual: number[], expected: number[], digits = 4) {
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, digits));
}

describe('FootIKLayer', () => {
  it('reports the clip feet in model space and changes nothing on flat ground', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.setWeight(0, 1);
    frame();

    expectVector(
      layer.footPosition(0, 0, new Vector3()).toArray(),
      [0.2, 0, 0.1]
    );
    expectVector(
      layer.footPosition(0, 1, new Vector3()).toArray(),
      [-0.2, 0, 0.1]
    );
    expectVector(positionOf(poses, 0, PELVIS), [0, 1, 0]);
    expectVector(positionOf(poses, 0, FOOT_L), [0.2, 0, 0.1]);
  });

  it('moves each foot by its offset and drops the pelvis by the lowest', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.setWeight(0, 1);
    layer.setOffset(0, 0, 0.2);
    layer.setOffset(0, 1, -0.1);
    frame();

    expectVector(positionOf(poses, 0, PELVIS), [0, 0.9, 0]);
    expectVector(positionOf(poses, 0, FOOT_L), [0.2, 0.2, 0.1]);
    expectVector(positionOf(poses, 0, FOOT_R), [-0.2, -0.1, 0.1]);
    expectVector(positionOf(poses, 0, SPINE), [0, 1.2, 0]);
  });

  it('raises the pelvis when every foot is higher', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.setWeight(0, 1);
    layer.setOffset(0, 0, 0.3);
    layer.setOffset(0, 1, 0.1);
    frame();

    expectVector(positionOf(poses, 0, PELVIS), [0, 1.1, 0]);
    expectVector(positionOf(poses, 0, FOOT_L), [0.2, 0.3, 0.1]);
    expectVector(positionOf(poses, 0, FOOT_R), [-0.2, 0.1, 0.1]);
  });

  it('bends the knee without stretching a bone', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.setWeight(0, 1);
    layer.setOffset(0, 0, 0.35);
    frame();

    const hip = positionOf(poses, 0, UPPER_L);
    const knee = positionOf(poses, 0, LOWER_L);
    const ankle = positionOf(poses, 0, END_L);
    const bone = Math.hypot(0.5, 0.1);
    expect(distance(hip, knee)).toBeCloseTo(bone, 4);
    expect(distance(knee, ankle)).toBeCloseTo(bone, 4);
    expect(knee[2]).toBeGreaterThan(0.1);
    expectVector(ankle, [0.2, 0.35, 0]);
  });

  it('keeps the carried bone at its clip rotation', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.setWeight(0, 1);
    layer.setOffset(0, 0, 0.25);
    frame();

    expectVector(axesOf(poses, 0, END_L), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('scales the offsets by the weight', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.setWeight(0, 0.5);
    layer.setOffset(0, 0, 0.2);
    frame();

    expectVector(positionOf(poses, 0, FOOT_L), [0.2, 0.1, 0.1]);
  });

  it('skips a slot with no weight or no clip', () => {
    const { poses, layer, frame, add } = setup();
    add();
    add(false);
    layer.setOffset(0, 0, 0.2);
    layer.setWeight(1, 1);
    layer.setOffset(1, 0, 0.2);
    frame();
    frame();

    expectVector(positionOf(poses, 0, FOOT_L), [0.2, 0, 0.1]);
    expectVector(positionOf(poses, 1, FOOT_L), [0.2, 0, 0.1]);
    expectVector(layer.footPosition(1, 0, new Vector3()).toArray(), [0, 0, 0]);
  });

  it('does not build up from frame to frame', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.setWeight(0, 1);
    layer.setOffset(0, 0, 0.2);
    layer.setOffset(0, 1, -0.1);
    frame();
    const first = positionOf(poses, 0, FOOT_L);
    for (let i = 0; i < 10; i++) frame();

    expectVector(positionOf(poses, 0, FOOT_L), first);
    expectVector(positionOf(poses, 0, PELVIS), [0, 0.9, 0]);
  });

  it('works through an armature scale', () => {
    const { poses, layer, frame, add } = setup(skeleton(0.01));
    add();
    layer.setWeight(0, 1);
    layer.setOffset(0, 0, 0.2);
    layer.setOffset(0, 1, -0.1);
    frame();

    expect(layer.legReach(0)).toBeCloseTo(2 * Math.hypot(0.5, 0.1), 4);
    expectVector(positionOf(poses, 0, PELVIS), [0, 0.9, 0]);
    expectVector(positionOf(poses, 0, FOOT_L), [0.2, 0.2, 0.1]);
    expectVector(positionOf(poses, 0, FOOT_R), [-0.2, -0.1, 0.1]);
  });

  it('bends a leg the clip holds straight', () => {
    const { poses, layer, frame, add } = setup(skeleton(1, 0));
    add();
    layer.setWeight(0, 1);
    layer.setOffset(0, 0, 0.2);
    frame();

    expectVector(positionOf(poses, 0, END_L), [0.2, 0.2, 0]);
    const hip = positionOf(poses, 0, UPPER_L);
    const knee = positionOf(poses, 0, LOWER_L);
    expect(distance(hip, knee)).toBeCloseTo(0.5, 4);
  });

  it('moves a slot with swap-remove and clears a reused one', () => {
    const { poses, layer, frame, add } = setup();
    const a = add();
    add();
    layer.setWeight(1, 1);
    layer.setOffset(1, 0, 0.2);

    poses.remove(a);
    frame();
    expectVector(positionOf(poses, 0, FOOT_L), [0.2, 0.2, 0.1]);

    add();
    frame();
    expectVector(positionOf(poses, 1, FOOT_L), [0.2, 0, 0.1]);
  });

  it('keeps its values when the store grows', () => {
    const poses = new PoseStore(skeleton(), 1);
    const player = new ClipPlayer(poses, [stand()]);
    const layer = new FootIKLayer(poses, player);
    layer.setLegs(LEGS);
    player.play(poses.add(), 'stand');
    layer.setWeight(0, 1);
    layer.setOffset(0, 0, 0.2);
    player.play(poses.add(), 'stand');

    player.update(1 / 60);
    layer.apply();
    poses.update();

    expectVector(positionOf(poses, 0, FOOT_L), [0.2, 0.2, 0.1]);
  });

  it('accepts the same legs again and refuses others', () => {
    const { layer } = setup();

    expect(() => layer.setLegs(LEGS.map((leg) => leg.slice()))).not.toThrow();
    expect(() => layer.setLegs([LEGS[0]])).toThrow(/differ/);
  });

  it('refuses legs it cannot solve', () => {
    const fresh = () => {
      const poses = new PoseStore(skeleton());
      return new FootIKLayer(poses, new ClipPlayer(poses, []));
    };

    expect(() => fresh().setLegs([])).toThrow(/no legs/);
    expect(() => fresh().setLegs([['upper.L', 'lower.L']])).toThrow(/carried/);
    expect(() => fresh().setLegs([['upper.L', 'lower.L', 'paw']])).toThrow(
      /does not exist/
    );
    expect(() => fresh().setLegs([['upper.L', 'end.L', 'foot.L']])).toThrow(
      /child/
    );
    expect(() =>
      fresh().setLegs([['upper.L', 'lower.L', 'end.L', 'spine']])
    ).toThrow(/parent first/);
    expect(() => fresh().setLegs([['root', 'pelvis', 'upper.L']])).toThrow(
      /share no parent/
    );
  });

  describe('with four legs', () => {
    function setupQuad() {
      const poses = new PoseStore(quadruped());
      const player = new ClipPlayer(poses, [stand(QUAD_CHEST)]);
      const layer = new FootIKLayer(poses, player);
      layer.setLegs(QUAD_LEGS);
      player.play(poses.add(), 'stand');
      layer.setWeight(0, 1);
      const frame = () => {
        player.update(1 / 60);
        layer.apply();
        poses.update();
      };
      const feet = (offsets: number[]) =>
        offsets.forEach((offset, leg) => layer.setOffset(0, leg, offset));
      return { poses, layer, frame, feet };
    }

    /** Rise per metre of the body from pelvis to chest. */
    function bodySlope(poses: PoseStore): number {
      const pelvis = positionOf(poses, 0, QUAD_PELVIS);
      const chest = positionOf(poses, 0, QUAD_CHEST);
      return (chest[1] - pelvis[1]) / (chest[2] - pelvis[2]);
    }

    function expectFeetAt(poses: PoseStore, offsets: number[]) {
      offsets.forEach((offset, leg) => {
        const foot = QUAD_UPPER[leg] + 3;
        expect(positionOf(poses, 0, foot)[1]).toBeCloseTo(offset, 4);
      });
    }

    function expectBonesKept(poses: PoseStore) {
      const bone = Math.hypot(0.5, 0.1);
      for (const upper of QUAD_UPPER) {
        const hip = positionOf(poses, 0, upper);
        const knee = positionOf(poses, 0, upper + 1);
        const ankle = positionOf(poses, 0, upper + 2);
        expect(distance(hip, knee)).toBeCloseTo(bone, 4);
        expect(distance(knee, ankle)).toBeCloseTo(bone, 4);
      }
    }

    it('pitches the body with a slope along it', () => {
      const { poses, layer, frame, feet } = setupQuad();
      const offsets = [-0.1, -0.1, 0.1, 0.1];
      layer.setTilt(0, 1, 0);
      feet(offsets);
      frame();

      expect(bodySlope(poses)).toBeCloseTo(0.2, 4);
      expectFeetAt(poses, offsets);
      expectBonesKept(poses);
    });

    it('rolls the body with a slope across it', () => {
      const { poses, layer, frame, feet } = setupQuad();
      const offsets = [0.1, -0.1, 0.1, -0.1];
      layer.setTilt(0, 0, 1);
      feet(offsets);
      frame();

      const axes = axesOf(poses, 0, QUAD_PELVIS);
      expect(axes[1] / axes[0]).toBeCloseTo(0.5, 4);
      expect(bodySlope(poses)).toBeCloseTo(0, 4);
      expectFeetAt(poses, offsets);
      expectBonesKept(poses);
    });

    it('follows its share of the slope', () => {
      const { poses, layer, frame, feet } = setupQuad();
      const offsets = [-0.1, -0.1, 0.1, 0.1];
      layer.setTilt(0, 0.5, 0);
      feet(offsets);
      frame();

      expect(bodySlope(poses)).toBeCloseTo(0.1, 4);
      expectFeetAt(poses, offsets);
      expectBonesKept(poses);
    });

    it('stays level without a share, with the legs taking the slope', () => {
      const { poses, frame, feet } = setupQuad();
      const offsets = [-0.1, -0.1, 0.1, 0.1];
      feet(offsets);
      frame();

      expect(bodySlope(poses)).toBeCloseTo(0, 4);
      expectVector(positionOf(poses, 0, QUAD_PELVIS), [0, 0.9, -0.5]);
      expectFeetAt(poses, offsets);
    });

    it('rises without tilting when every foot is equally higher', () => {
      const { poses, layer, frame, feet } = setupQuad();
      layer.setTilt(0, 1, 1);
      feet([0.1, 0.1, 0.1, 0.1]);
      frame();

      expect(bodySlope(poses)).toBeCloseTo(0, 4);
      expectVector(positionOf(poses, 0, QUAD_PELVIS), [0, 1.1, -0.5]);
    });

    it('does not build up a tilt from frame to frame', () => {
      const { poses, layer, frame, feet } = setupQuad();
      layer.setTilt(0, 1, 1);
      feet([-0.1, 0.05, 0.12, 0.2]);
      frame();
      const pelvis = positionOf(poses, 0, QUAD_PELVIS);
      const chest = positionOf(poses, 0, QUAD_CHEST);
      for (let i = 0; i < 10; i++) frame();

      expectVector(positionOf(poses, 0, QUAD_PELVIS), pelvis);
      expectVector(positionOf(poses, 0, QUAD_CHEST), chest);
      expectFeetAt(poses, [-0.1, 0.05, 0.12, 0.2]);
      expectBonesKept(poses);
    });

    it('keeps each paw at its clip rotation while the body tilts', () => {
      const { poses, layer, frame, feet } = setupQuad();
      layer.setTilt(0, 1, 1);
      feet([-0.1, 0.05, 0.12, 0.2]);
      frame();

      for (const upper of QUAD_UPPER)
        expectVector(axesOf(poses, 0, upper + 2), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    });
  });

  it('never tilts a biped', () => {
    const { poses, layer, frame, add } = setup();
    add();
    layer.setWeight(0, 1);
    layer.setTilt(0, 1, 1);
    layer.setOffset(0, 0, 0.2);
    layer.setOffset(0, 1, -0.1);
    frame();

    expectVector(axesOf(poses, 0, PELVIS), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expectVector(positionOf(poses, 0, PELVIS), [0, 0.9, 0]);
  });

  it('does nothing without legs', () => {
    const poses = new PoseStore(skeleton());
    const player = new ClipPlayer(poses, [stand()]);
    const layer = new FootIKLayer(poses, player);
    player.play(poses.add(), 'stand');

    player.update(1 / 60);
    layer.apply();
    poses.update();

    expectVector(positionOf(poses, 0, FOOT_L), [0.2, 0, 0.1]);
  });
});
