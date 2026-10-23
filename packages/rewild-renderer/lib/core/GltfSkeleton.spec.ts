import type { GLTFPostprocessed } from '@loaders.gl/gltf';
import { parseGltf } from './GltfLoader';
import { toFloat32, toSkinAttributes } from './GltfSkeleton';

function accessor(value: ArrayLike<number>, components = 3) {
  return { value, components };
}

/** IBM for joint `n`: identity with n in the x translation, so order shows. */
function inverseBind(n: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, n, 0, 0, 1];
}

/**
 * Armature (translated, non-joint) > hip > leg, plus a skinned body. The skin
 * lists leg before hip, so import must reorder the joints parent first.
 */
function skinnedGltf(
  overrides: { animations?: unknown[]; accessors?: unknown[] } = {}
): GLTFPostprocessed {
  const leg: Record<string, unknown> = {
    id: 'node-2',
    name: 'leg',
    translation: [0, -0.5, 0],
  };
  const hip: Record<string, unknown> = {
    id: 'node-1',
    name: 'hip',
    translation: [0, 1, 0],
    children: [leg],
  };
  const skin = {
    id: 'skin-0',
    joints: [2, 1],
    inverseBindMatrices: accessor(
      new Float32Array([...inverseBind(2), ...inverseBind(1)]),
      16
    ),
  };
  const body: Record<string, unknown> = {
    id: 'node-3',
    name: 'body',
    skin,
    mesh: {
      primitives: [
        {
          attributes: {
            POSITION: accessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])),
            JOINTS_0: accessor(
              new Uint8Array([0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
              4
            ),
            WEIGHTS_0: accessor(
              new Uint8Array([128, 128, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0]),
              4
            ),
          },
        },
      ],
    },
  };
  const armature: Record<string, unknown> = {
    id: 'node-0',
    name: 'Armature',
    translation: [5, 0, 0],
    children: [hip, body],
  };
  const nodes = [armature, hip, leg, body];

  return {
    scene: { nodes: [armature] },
    scenes: [{ nodes: [armature] }],
    nodes,
    skins: [skin],
    accessors: overrides.accessors ?? [],
    animations: overrides.animations ?? [],
  } as unknown as GLTFPostprocessed;
}

const twoClipAccessors = [
  accessor(new Float32Array([0, 1]), 1),
  accessor(new Float32Array([0, 0, 0, 1, 0, 0.7071, 0, 0.7071]), 4),
  accessor(new Float32Array([0, 0.5, 2]), 1),
  accessor(new Float32Array([0, -0.5, 0, 0, -0.4, 0, 0, -0.5, 0]), 3),
  accessor(new Float32Array([0, 0, 0, 1, 0, 0]), 3),
];

const twoClipAnimations = [
  {
    name: 'idle',
    samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }],
    channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }],
  },
  {
    name: 'walk',
    samplers: [
      { input: 2, output: 3, interpolation: 'STEP' },
      { input: 0, output: 4 },
    ],
    channels: [
      { sampler: 0, target: { node: 2, path: 'translation' } },
      { sampler: 1, target: { node: 0, path: 'translation' } },
    ],
  },
];

describe('skinned glTF import', () => {
  const model = parseGltf(
    skinnedGltf({ accessors: twoClipAccessors, animations: twoClipAnimations })
  );
  const skeleton = model.skeleton!;

  it('orders joints parent first, whatever order the skin lists them in', () => {
    expect(skeleton.names).toEqual(['hip', 'leg']);
    expect(Array.from(skeleton.parents)).toEqual([-1, 0]);
  });

  it('reads the rest pose off the joint nodes', () => {
    expect(Array.from(skeleton.translations)).toEqual([0, 1, 0, 0, -0.5, 0]);
    expect(Array.from(skeleton.rotations)).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
    expect(Array.from(skeleton.scales)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('reorders the inverse bind matrices with the joints', () => {
    expect(skeleton.inverseBindMatrices[12]).toBe(1);
    expect(skeleton.inverseBindMatrices[16 + 12]).toBe(2);
  });

  it('keeps the armature transform the root joints hang from', () => {
    expect(Array.from(skeleton.rootMatrix.slice(12, 15))).toEqual([5, 0, 0]);
  });

  it('remaps JOINTS_0 to skeleton order', () => {
    const geometry = model.roots[0].children[1].primitives[0].geometry;

    expect(geometry.joints).toBeInstanceOf(Uint16Array);
    expect(Array.from(geometry.joints!.slice(0, 8))).toEqual([
      1, 0, 1, 1, 0, 1, 1, 1,
    ]);
  });

  it('normalizes WEIGHTS_0 to float weights that sum to 1', () => {
    const weights = model.roots[0].children[1].primitives[0].geometry.weights!;

    const expected = [0.5, 0.5, 0, 0, 1, 0, 0, 0];

    expected.forEach((weight, i) => expect(weights[i]).toBeCloseTo(weight));
  });

  it('binds a vertex with no weight fully to its first joint', () => {
    const weights = model.roots[0].children[1].primitives[0].geometry.weights!;

    expect(Array.from(weights.slice(8, 12))).toEqual([1, 0, 0, 0]);
  });

  it('reads two clips by name with their durations', () => {
    expect(model.clips.map((c) => c.name)).toEqual(['idle', 'walk']);
    expect(model.clips[0].duration).toBe(1);
    expect(model.clips[1].duration).toBe(2);
  });

  it('targets channels at skeleton joints and drops channels on other nodes', () => {
    const [idle, walk] = model.clips;

    expect(idle.channels).toHaveLength(1);
    expect(idle.channels[0]).toMatchObject({
      joint: 0,
      path: 'rotation',
      interpolation: 'LINEAR',
    });
    expect(walk.channels).toHaveLength(1);
    expect(walk.channels[0]).toMatchObject({
      joint: 1,
      path: 'translation',
      interpolation: 'STEP',
    });
    expect(Array.from(walk.channels[0].times)).toEqual([0, 0.5, 2]);
  });

  it('keeps the keyed values of a cubic spline and drops its tangents', () => {
    const cubic = parseGltf(
      skinnedGltf({
        accessors: [
          accessor(new Float32Array([0, 1]), 1),
          accessor(
            new Float32Array([
              9, 9, 9, 1, 2, 3, 9, 9, 9, 9, 9, 9, 4, 5, 6, 9, 9, 9,
            ]),
            3
          ),
        ],
        animations: [
          {
            name: 'hop',
            samplers: [{ input: 0, output: 1, interpolation: 'CUBICSPLINE' }],
            channels: [{ sampler: 0, target: { node: 1, path: 'scale' } }],
          },
        ],
      })
    );
    const channel = cubic.clips[0].channels[0];

    expect(channel.interpolation).toBe('LINEAR');
    expect(Array.from(channel.values)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('drops a clip that moves no joint', () => {
    const clips = parseGltf(
      skinnedGltf({
        accessors: twoClipAccessors,
        animations: [
          {
            name: 'armature-only',
            samplers: [{ input: 0, output: 4 }],
            channels: [
              { sampler: 0, target: { node: 0, path: 'translation' } },
            ],
          },
        ],
      })
    ).clips;

    expect(clips).toEqual([]);
  });

  it('loads a model without skins as static', () => {
    const gltf = skinnedGltf();
    (gltf as unknown as { skins: unknown[] }).skins = [];
    const staticModel = parseGltf(gltf);
    const geometry = staticModel.roots[0].children[1].primitives[0].geometry;

    expect(staticModel.skeleton).toBeNull();
    expect(staticModel.clips).toEqual([]);
    expect(geometry.joints).toBeUndefined();
    expect(geometry.weights).toBeUndefined();
  });
});

describe('toFloat32', () => {
  it('maps normalized integers into their spec range', () => {
    expect(Array.from(toFloat32(new Uint8Array([0, 255])))).toEqual([0, 1]);
    expect(Array.from(toFloat32(new Int16Array([-32768, 32767])))).toEqual([
      -1, 1,
    ]);
  });
});

describe('toSkinAttributes', () => {
  it('widens u16 joints through the remap', () => {
    const { joints } = toSkinAttributes(
      new Uint16Array([0, 1, 2, 0]),
      new Float32Array([1, 0, 0, 0]),
      new Uint16Array([2, 0, 1])
    );

    expect(Array.from(joints)).toEqual([2, 0, 1, 2]);
  });
});
