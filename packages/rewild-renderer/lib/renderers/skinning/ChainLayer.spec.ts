import { GltfSkeleton } from '../../core/GltfSkeleton';
import { ChainLayer, ChainShape } from './ChainLayer';
import { ClipPlayer } from './ClipPlayer';
import { PoseStore } from './PoseStore';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const S = Math.SQRT1_2;
const JOINTS = 6;

/**
 * Root turned −90° about x with scale 0.01 on the armature, so local +y runs
 * to model −Z, toward the tail. s1 to s4 sit 0.1 apart, and fin hangs off s4.
 */
function skeleton(): GltfSkeleton {
  const rotations = new Float32Array(JOINTS * 4);
  for (let j = 0; j < JOINTS; j++) rotations[j * 4 + 3] = 1;
  rotations.set([-S, 0, 0, S], 0);
  return {
    names: ['root', 's1', 's2', 's3', 's4', 'fin'],
    parents: new Int32Array([-1, 0, 1, 2, 3, 4]),
    translations: new Float32Array([
      0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 10, 0, 0, 10, 0, 0, 5, 0,
    ]),
    rotations,
    scales: new Float32Array(JOINTS * 3).fill(1),
    inverseBindMatrices: new Float32Array(
      Array.from({ length: JOINTS }, () => IDENTITY).flat()
    ),
    rootMatrix: new Float32Array([
      0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 1,
    ]),
  };
}

const STRAIGHT: ChainShape = { stiff: 0, wavelength: 1 };
const CHAIN = ['s1', 's2', 's3', 's4'];

function setup(shape = STRAIGHT) {
  const poses = new PoseStore(skeleton());
  const player = new ClipPlayer(poses, []);
  const layer = new ChainLayer(poses, player);
  layer.setChain(CHAIN, shape);
  const frame = () => {
    player.update(1 / 60);
    layer.apply();
    poses.update();
  };
  return { poses, player, layer, frame };
}

function position(poses: PoseStore, slot: number, joint: number): number[] {
  const o = (slot * poses.jointCount + joint) * 16;
  const m = poses.jointMatrices;
  return [m[o + 12], m[o + 13], m[o + 14]];
}

/** Angle about +Y from model −Z of the segment from one joint to the next. */
function segmentAngle(poses: PoseStore, slot: number, joint: number): number {
  const a = position(poses, slot, joint);
  const b = position(poses, slot, joint + 1);
  return Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
}

describe('ChainLayer', () => {
  it('turns the player to pose a slot with no clip', () => {
    const { poses, player } = setup();
    poses.add();
    player.update(1 / 60);

    expect(player.alwaysPose).toBe(true);
    expect(player.posed(0)).toBe(true);
  });

  it('curves the back of the chain toward +X for a positive curve', () => {
    const { poses, layer, frame } = setup();
    poses.add();
    layer.set(0, 0, 0, 0.6, 1);
    frame();

    expect(position(poses, 0, 5)[0]).toBeGreaterThan(0);
    expect(segmentAngle(poses, 0, 1)).toBeCloseTo(0, 4);
    expect(segmentAngle(poses, 0, 2)).toBeCloseTo(-0.2, 4);
    expect(segmentAngle(poses, 0, 3)).toBeCloseTo(-0.4, 4);
    expect(segmentAngle(poses, 0, 4)).toBeCloseTo(-0.6, 4);
  });

  it('runs the wave down the chain by phase and envelope', () => {
    const { poses, layer, frame } = setup();
    poses.add();
    const amplitude = 0.5;
    const phase = 1.1;
    layer.set(0, phase, amplitude, 0, 1);
    frame();

    const wave = (s: number) =>
      amplitude * s * s * Math.sin(Math.PI * 2 * s - phase);
    expect(segmentAngle(poses, 0, 2)).toBeCloseTo(wave(1 / 3), 4);
    expect(segmentAngle(poses, 0, 3)).toBeCloseTo(wave(2 / 3), 4);
    expect(segmentAngle(poses, 0, 4)).toBeCloseTo(wave(1), 4);
  });

  it('keeps the stiff front of the chain straight', () => {
    const { poses, layer, frame } = setup({ stiff: 0.5, wavelength: 1 });
    poses.add();
    layer.set(0, 2, 0.5, 0, 1);
    frame();

    expect(segmentAngle(poses, 0, 2)).toBeCloseTo(0, 4);
    expect(segmentAngle(poses, 0, 4)).not.toBeCloseTo(0, 2);
  });

  it('scales the bend by the weight, and skips a slot at 0', () => {
    const { poses, layer, frame } = setup();
    poses.add();
    layer.set(0, 0, 0, 0.6, 0.5);
    frame();
    expect(segmentAngle(poses, 0, 4)).toBeCloseTo(-0.3, 4);

    layer.set(0, 0, 0, 0.6, 0);
    frame();
    expect(segmentAngle(poses, 0, 4)).toBeCloseTo(0, 4);
  });

  it('does not build up from frame to frame', () => {
    const { poses, layer, frame } = setup();
    poses.add();
    layer.set(0, 0.7, 0.4, 0.3, 1);
    frame();
    const first = segmentAngle(poses, 0, 4);
    for (let i = 0; i < 10; i++) frame();

    expect(segmentAngle(poses, 0, 4)).toBeCloseTo(first, 4);
  });

  it('moves a slot with swap-remove and clears a reused one', () => {
    const { poses, layer, frame } = setup();
    const a = poses.add();
    poses.add();
    layer.set(1, 0, 0, 0.6, 1);

    poses.remove(a);
    frame();
    expect(segmentAngle(poses, 0, 4)).toBeCloseTo(-0.6, 4);

    poses.add();
    frame();
    expect(segmentAngle(poses, 1, 4)).toBeCloseTo(0, 4);
  });

  it('accepts the same chain again and refuses another', () => {
    const { layer } = setup();

    expect(() => layer.setChain(CHAIN, STRAIGHT)).not.toThrow();
    expect(() => layer.setChain(['s1', 's2'], STRAIGHT)).toThrow(/differs/);
  });

  it('refuses a short chain, a missing bone or one out of order', () => {
    const fresh = () => {
      const poses = new PoseStore(skeleton());
      return new ChainLayer(poses, new ClipPlayer(poses, []));
    };

    expect(() => fresh().setChain(['s1'], STRAIGHT)).toThrow(/two bones/);
    expect(() => fresh().setChain(['s1', 'tail'], STRAIGHT)).toThrow(
      /does not exist/
    );
    expect(() => fresh().setChain(['s3', 's1'], STRAIGHT)).toThrow(
      /parent first/
    );
    expect(() => fresh().setChain(['root', 's1'], STRAIGHT)).toThrow(
      /one point/
    );
  });

  it('does nothing without a chain', () => {
    const poses = new PoseStore(skeleton());
    const player = new ClipPlayer(poses, []);
    const layer = new ChainLayer(poses, player);
    poses.add();
    layer.set(0, 0, 0, 0.6, 1);
    player.update(1 / 60);
    layer.apply();
    poses.update();

    expect(player.alwaysPose).toBe(false);
    expect(segmentAngle(poses, 0, 4)).toBeCloseTo(0, 4);
  });
});

describe('ChainLayer head', () => {
  it('swings the stiff front by the head share of the amplitude', () => {
    const { poses, layer, frame } = setup({
      stiff: 0.5,
      wavelength: 1,
      head: 0.2,
    });
    poses.add();
    const phase = 1;
    layer.set(0, phase, 0.5, 0, 1);
    frame();

    expect(segmentAngle(poses, 0, 1)).toBeCloseTo(
      0.5 * 0.2 * Math.sin(-phase),
      4
    );
    expect(segmentAngle(poses, 0, 2)).toBeCloseTo(
      0.5 * 0.2 * Math.sin((Math.PI * 2) / 3 - phase),
      4
    );
  });
});

describe('ChainLayer pivot', () => {
  it('turns the chain about the point nearest the model origin', () => {
    const shifted = skeleton();
    shifted.rootMatrix[14] = 0.15;
    const poses = new PoseStore(shifted);
    const player = new ClipPlayer(poses, []);
    const layer = new ChainLayer(poses, player);
    layer.setChain(CHAIN, STRAIGHT);
    poses.add();
    layer.set(0, 0, 0, 0.6, 1);
    player.update(1 / 60);
    layer.apply();
    poses.update();

    expect(layer.pivot).toBeCloseTo(0.5, 4);
    expect(layer.length).toBeCloseTo(0.3, 4);
    expect(segmentAngle(poses, 0, 1)).toBeCloseTo(0.3, 4);
    expect(segmentAngle(poses, 0, 4)).toBeCloseTo(-0.3, 4);
  });
});
