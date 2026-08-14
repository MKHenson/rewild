import type { GLTFPostprocessed } from '@loaders.gl/gltf';
import { IMaterialPass } from '../materials/IMaterialPass';
import { Mesh } from './Mesh';
import { Transform } from './Transform';
import {
  GltfModel,
  GltfNode,
  collectGeometries,
  instantiateGltfModel,
  parseGltf,
} from './GltfLoader';

// postProcessGLTF resolves every index into an object, so these fixtures are
// the shape the parser actually walks rather than raw glTF JSON.
function accessor(value: ArrayLike<number>, components = 3) {
  return { value, components };
}

function primitive(
  options: {
    indices?: number[];
    normals?: number[];
    uvs?: number[];
    tangents?: { value: ArrayLike<number>; components: number };
    colors?: { value: ArrayLike<number>; components: number };
    material?: { name?: string; id?: string };
    mode?: number;
  } = {}
) {
  const attributes: Record<string, unknown> = {
    POSITION: accessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])),
  };
  if (options.normals)
    attributes.NORMAL = accessor(new Float32Array(options.normals));
  if (options.uvs)
    attributes.TEXCOORD_0 = accessor(new Float32Array(options.uvs), 2);
  if (options.tangents)
    attributes.TANGENT = accessor(
      options.tangents.value,
      options.tangents.components
    );
  if (options.colors)
    attributes.COLOR_0 = accessor(
      options.colors.value,
      options.colors.components
    );

  return {
    attributes,
    indices: options.indices
      ? accessor(new Uint16Array(options.indices), 1)
      : undefined,
    material: options.material,
    mode: options.mode,
  };
}

function node(overrides: Record<string, unknown> = {}) {
  return { id: 'node-id', ...overrides };
}

/** A glTF whose default scene holds the given roots. */
function gltf(...nodes: ReturnType<typeof node>[]): GLTFPostprocessed {
  return {
    scene: { nodes },
    scenes: [{ nodes }],
  } as unknown as GLTFPostprocessed;
}

function fakeMaterial(name = 'fake'): IMaterialPass {
  return { name, isGeometryCompatible: () => true } as unknown as IMaterialPass;
}

/** Renders the tree depth-first so structure can be asserted in one go. */
function describeTree(transform: Transform): string[] {
  const lines: string[] = [];
  const visit = (t: Transform, depth: number) => {
    lines.push(
      `${'  '.repeat(depth)}${t.name}${
        t.component instanceof Mesh ? ' [mesh]' : ''
      }`
    );
    for (const child of t.children) visit(child, depth + 1);
  };
  visit(transform, 0);
  return lines;
}

describe('parseGltf', () => {
  it('takes the roots of the default scene, not the flat node list', () => {
    const child = node({ name: 'child' });
    const root = node({ name: 'root', children: [child] });

    const model = parseGltf({
      ...gltf(root),
      nodes: [root, child],
    } as unknown as GLTFPostprocessed);

    expect(model.roots).toHaveLength(1);
    expect(model.roots[0].name).toBe('root');
    expect(model.roots[0].children[0].name).toBe('child');
  });

  it('derives roots by parentage when the file declares no scene', () => {
    const child = node({ name: 'child' });
    const root = node({ name: 'root', children: [child] });
    const loose = node({ name: 'loose' });

    const model = parseGltf({
      nodes: [root, child, loose],
    } as unknown as GLTFPostprocessed);

    expect(model.roots.map((n: GltfNode) => n.name)).toEqual(['root', 'loose']);
  });

  it('reads TRS off the node', () => {
    const model = parseGltf(
      gltf(
        node({
          name: 'placed',
          translation: [1, 2, 3],
          rotation: [0, 0.7071, 0, 0.7071],
          scale: [2, 2, 2],
        })
      )
    );

    expect(model.roots[0].translation).toEqual([1, 2, 3]);
    expect(model.roots[0].rotation).toEqual([0, 0.7071, 0, 0.7071]);
    expect(model.roots[0].scale).toEqual([2, 2, 2]);
  });

  it('defaults the transform to identity when the node omits it', () => {
    const model = parseGltf(gltf(node({ name: 'bare' })));

    expect(model.roots[0].translation).toEqual([0, 0, 0]);
    expect(model.roots[0].rotation).toEqual([0, 0, 0, 1]);
    expect(model.roots[0].scale).toEqual([1, 1, 1]);
  });

  it('decomposes a matrix node into TRS', () => {
    // Column-major, scale 2 with translation (5, 6, 7) — glTF's own layout.
    const model = parseGltf(
      gltf(
        node({
          name: 'matrixed',
          matrix: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 5, 6, 7, 1],
        })
      )
    );
    const root = model.roots[0];

    expect(root.translation[0]).toBeCloseTo(5);
    expect(root.translation[1]).toBeCloseTo(6);
    expect(root.translation[2]).toBeCloseTo(7);
    expect(root.scale[0]).toBeCloseTo(2);
    expect(root.rotation[3]).toBeCloseTo(1);
  });

  it('splits a multi-primitive mesh into one primitive per material', () => {
    const model = parseGltf(
      gltf(
        node({
          name: 'two-tone',
          mesh: {
            primitives: [
              primitive({ material: { name: 'body' } }),
              primitive({ material: { name: 'glass' } }),
            ],
          },
        })
      )
    );

    expect(model.roots[0].primitives.map((p) => p.materialName)).toEqual([
      'body',
      'glass',
    ]);
    // Each primitive owns its own geometry — sharing one would collapse them.
    expect(model.roots[0].primitives[0].geometry).not.toBe(
      model.roots[0].primitives[1].geometry
    );
  });

  it('falls back to the material id when unnamed, and null when absent', () => {
    const model = parseGltf(
      gltf(
        node({
          mesh: {
            primitives: [
              primitive({ material: { id: 'material-3' } }),
              primitive({}),
            ],
          },
        })
      )
    );

    expect(model.roots[0].primitives.map((p) => p.materialName)).toEqual([
      'material-3',
      null,
    ]);
  });

  it('skips primitives the engine cannot rasterize', () => {
    const model = parseGltf(
      gltf(
        node({
          mesh: {
            primitives: [
              primitive({ mode: 1 }), // LINES
              primitive({ material: { name: 'solid' } }),
            ],
          },
        })
      )
    );

    expect(model.roots[0].primitives).toHaveLength(1);
    expect(model.roots[0].primitives[0].materialName).toBe('solid');
  });

  it('widens indices to u32 and leaves a non-indexed primitive without them', () => {
    const model = parseGltf(
      gltf(
        node({
          mesh: {
            primitives: [primitive({ indices: [0, 1, 2] }), primitive({})],
          },
        })
      )
    );
    const [indexed, nonIndexed] = model.roots[0].primitives;

    expect(indexed.geometry.indices).toBeInstanceOf(Uint32Array);
    expect(Array.from(indexed.geometry.indices!)).toEqual([0, 1, 2]);
    expect(nonIndexed.geometry.indices).toBeUndefined();
  });

  it('normalizes COLOR_0 to float RGBA regardless of how it was written', () => {
    const model = parseGltf(
      gltf(
        node({
          mesh: {
            primitives: [
              primitive({
                colors: {
                  value: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]),
                  components: 3,
                },
              }),
            ],
          },
        })
      )
    );
    const colors = model.roots[0].primitives[0].geometry.colors!;

    expect(colors).toBeInstanceOf(Float32Array);
    // A vec3 accessor gains alpha 1, which is what the spec says it means.
    expect(Array.from(colors.slice(0, 4))).toEqual([1, 0, 0, 1]);
  });

  // The triangle every fixture uses lies in XY with its normal on +Z, so a
  // straight U-along-X mapping has to come back as +X, right-handed.
  const flatUvs = [0, 0, 1, 0, 0, 1];

  it('imports TANGENT as the vec4 the spec defines', () => {
    const model = parseGltf(
      gltf(
        node({
          mesh: {
            primitives: [
              primitive({
                uvs: flatUvs,
                tangents: {
                  value: new Float32Array([
                    0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 1, -1,
                  ]),
                  components: 4,
                },
              }),
            ],
          },
        })
      )
    );
    const tangents = model.roots[0].primitives[0].geometry.tangents!;

    // Taken as authored rather than recomputed — the file's own frame is the
    // one its normal map was baked against.
    expect(Array.from(tangents.slice(0, 4))).toEqual([0, 0, 1, -1]);
  });

  it('gives a vec3 TANGENT the right-handed default it left out', () => {
    const model = parseGltf(
      gltf(
        node({
          mesh: {
            primitives: [
              primitive({
                uvs: flatUvs,
                tangents: {
                  value: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
                  components: 3,
                },
              }),
            ],
          },
        })
      )
    );
    const tangents = model.roots[0].primitives[0].geometry.tangents!;

    expect(tangents).toHaveLength(12);
    expect(Array.from(tangents.slice(0, 4))).toEqual([0, 0, 1, 1]);
  });

  it('derives a tangent frame from the UVs when the file omits one', () => {
    const model = parseGltf(
      gltf(node({ mesh: { primitives: [primitive({ uvs: flatUvs })] } }))
    );
    const tangents = model.roots[0].primitives[0].geometry.tangents!;

    expect(tangents).toHaveLength(12);
    expect(Array.from(tangents.slice(0, 4))).toEqual([1, 0, 0, 1]);
  });

  it('derives negative handedness where the UVs are mirrored', () => {
    const model = parseGltf(
      gltf(
        node({
          mesh: {
            primitives: [primitive({ uvs: [0, 0, -1, 0, 0, 1] })],
          },
        })
      )
    );
    const tangents = model.roots[0].primitives[0].geometry.tangents!;

    // Mirroring is the case a screen-space reconstruction gets wrong and this
    // gets right, so it is the one worth asserting.
    expect(Array.from(tangents.slice(0, 4))).toEqual([-1, 0, 0, -1]);
  });

  // Without UVs there is no tangent space to speak of, and no normal map can be
  // sampled either — deriving one would be 16 bytes a vertex of nothing.
  it('leaves a primitive with no UVs untangented', () => {
    const model = parseGltf(
      gltf(node({ mesh: { primitives: [primitive({})] } }))
    );

    expect(model.roots[0].primitives[0].geometry.tangents).toBeUndefined();
  });

  it('computes bounds so the mesh can be culled and picked', () => {
    const model = parseGltf(
      gltf(node({ mesh: { primitives: [primitive({})] } }))
    );
    const geometry = model.roots[0].primitives[0].geometry;

    expect(geometry.boundingBox).not.toBeNull();
    expect(geometry.boundingSphere).not.toBeNull();
  });
});

describe('collectGeometries', () => {
  it('gathers every geometry in the tree so buffers can be built and freed', () => {
    const model = parseGltf(
      gltf(
        node({
          name: 'root',
          mesh: { primitives: [primitive({}), primitive({})] },
          children: [
            node({ name: 'child', mesh: { primitives: [primitive({})] } }),
          ],
        })
      )
    );

    expect(collectGeometries(model)).toHaveLength(3);
  });
});

describe('instantiateGltfModel', () => {
  /** A model of one node carrying `count` primitives. */
  function modelWith(
    name: string,
    count: number,
    extra: Partial<GltfNode> = {}
  ) {
    const model = parseGltf(
      gltf(
        node({
          name,
          mesh: {
            primitives: Array.from({ length: count }, (_, i) =>
              primitive({ material: { name: `material-${i}` } })
            ),
          },
        })
      )
    );
    Object.assign(model.roots[0], extra);
    return model;
  }

  it('puts a single-primitive node on its own transform, adding no wrapper', () => {
    const root = instantiateGltfModel(modelWith('crate', 1), () =>
      fakeMaterial()
    );

    expect(describeTree(root)).toEqual(['crate [mesh]']);
  });

  it('gives a multi-primitive node a child per primitive', () => {
    const root = instantiateGltfModel(modelWith('car', 2), () =>
      fakeMaterial()
    );

    expect(describeTree(root)).toEqual([
      'car',
      '  car[0] [mesh]',
      '  car[1] [mesh]',
    ]);
  });

  it('mirrors the node hierarchy', () => {
    const model = modelWith('body', 1, {
      children: modelWith('wheel', 1).roots,
    });

    const root = instantiateGltfModel(model, () => fakeMaterial());

    expect(describeTree(root)).toEqual(['body [mesh]', '  wheel [mesh]']);
  });

  it('wraps several roots in one transform', () => {
    const model: GltfModel = {
      roots: [...modelWith('left', 1).roots, ...modelWith('right', 1).roots],
      textures: [],
      materials: [],
    };

    const root = instantiateGltfModel(model, () => fakeMaterial());

    expect(describeTree(root)).toEqual(['', '  left [mesh]', '  right [mesh]']);
  });

  it('applies the node transform rather than baking it into the vertices', () => {
    const model = modelWith('offset', 1, {
      translation: [10, 20, 30],
      scale: [2, 2, 2],
    });
    const geometry = model.roots[0].primitives[0].geometry;
    const verticesBefore = Array.from(geometry.vertices);

    const root = instantiateGltfModel(model, () => fakeMaterial());

    expect([root.position.x, root.position.y, root.position.z]).toEqual([
      10, 20, 30,
    ]);
    expect(root.scale.x).toBe(2);
    expect(Array.from(geometry.vertices)).toEqual(verticesBefore);
  });

  it('resolves a material per primitive', () => {
    const seen: (string | null)[] = [];

    instantiateGltfModel(modelWith('two-tone', 2), (primitive) => {
      seen.push(primitive.materialName);
      return fakeMaterial(primitive.materialKey);
    });

    expect(seen).toEqual(['material-0', 'material-1']);
  });

  it('shares geometries between instantiations', () => {
    const model = modelWith('plant', 1);

    const a = instantiateGltfModel(model, () => fakeMaterial());
    const b = instantiateGltfModel(model, () => fakeMaterial());

    expect(a).not.toBe(b);
    expect((a.component as Mesh).geometry).toBe((b.component as Mesh).geometry);
  });
});
