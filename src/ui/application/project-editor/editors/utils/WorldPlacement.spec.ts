import { Geometry } from 'rewild-renderer/lib/geometry/Geometry';
import { Mesh, Transform } from 'rewild-renderer';
import { IMaterialPass } from 'rewild-renderer/lib/materials/IMaterialPass';
import { Vector2 } from 'rewild-common';
import { TerrainChunk } from 'rewild-renderer/lib/renderers/terrain/TerrainChunk';
import { computeGroundOffset, isTerrainTransform } from './WorldPlacement';

function fakeMaterial(): IMaterialPass {
  return { isGeometryCompatible: () => true } as unknown as IMaterialPass;
}

/** The eight corners of a box spanning the given Y range, unit in X and Z. */
function boxGeometry(minY: number, maxY: number): Geometry {
  const corners: number[] = [];
  for (const y of [minY, maxY])
    for (const x of [-1, 1]) for (const z of [-1, 1]) corners.push(x, y, z);

  const geometry = new Geometry();
  geometry.vertices = new Float32Array(corners);
  geometry.computeBoundingBox();
  return geometry;
}

function meshTransform(minY: number, maxY: number): Transform {
  return new Mesh(boxGeometry(minY, maxY), fakeMaterial()).transform;
}

describe('computeGroundOffset', () => {
  it('returns half the height for an origin-centred primitive', () => {
    // Every built-in geometry factory is centred, so this is the case the old
    // half-height maths got right and must keep getting right.
    expect(computeGroundOffset(meshTransform(-0.5, 0.5))).toBeCloseTo(0.5);
  });

  it('returns the drop to the base for a model whose origin is at its base', () => {
    // The granite rock: base a hair under the origin, 1.6 tall. Half the height
    // would have floated it by 0.71.
    expect(computeGroundOffset(meshTransform(-0.0956, 1.5162))).toBeCloseTo(
      0.0956
    );
  });

  it('returns zero for a model sitting exactly on its origin', () => {
    expect(computeGroundOffset(meshTransform(0, 2))).toBeCloseTo(0);
  });

  it('lifts a model whose geometry sits above its origin', () => {
    // Negative offset — the object has to sink for its base to meet the ground.
    expect(computeGroundOffset(meshTransform(0.5, 2))).toBeCloseTo(-0.5);
  });

  it('unions the meshes of a multi-primitive model hanging off a bare root', () => {
    // A root transform with no component of its own is exactly what a
    // multi-material import produces, and what the old code scored as 0.
    const root = new Transform();
    root.addChild(meshTransform(-0.25, 1));
    root.addChild(meshTransform(-0.75, 0.5));

    expect(computeGroundOffset(root)).toBeCloseTo(0.75);
  });

  it('accounts for a child transform that moves its mesh', () => {
    const root = new Transform();
    const child = meshTransform(-0.5, 0.5);
    child.position.y = -2;
    root.addChild(child);

    expect(computeGroundOffset(root)).toBeCloseTo(2.5);
  });

  it('accounts for a scaled child', () => {
    const root = new Transform();
    const child = meshTransform(-0.5, 0.5);
    child.scale.set(1, 4, 1);
    root.addChild(child);

    expect(computeGroundOffset(root)).toBeCloseTo(2);
  });

  it('measures the same whether or not the object is already in a scene', () => {
    const loose = meshTransform(-0.0956, 1.5162);
    const parented = meshTransform(-0.0956, 1.5162);

    const scene = new Transform();
    scene.position.set(10, 37, -4);
    scene.addChild(parented);

    expect(computeGroundOffset(parented)).toBeCloseTo(
      computeGroundOffset(loose)
    );
  });

  it('returns zero for a transform carrying no meshes at all', () => {
    expect(computeGroundOffset(new Transform())).toBe(0);
  });
});

describe('isTerrainTransform', () => {
  function terrainChunk(): TerrainChunk {
    return new TerrainChunk(
      new Vector2(0, 0),
      241,
      240,
      [{ lod: 0, visibleDstThreshold: 200 }],
      1,
      'default'
    );
  }

  it('recognises the chunk transform itself', () => {
    expect(isTerrainTransform(terrainChunk().transform)).toBe(true);
  });

  it('recognises a LOD mesh parented under a chunk', () => {
    // What a raycast actually reports is the LOD mesh, never the chunk.
    const lodMesh = new Transform();
    terrainChunk().transform.addChild(lodMesh);

    expect(isTerrainTransform(lodMesh)).toBe(true);
  });

  it('rejects an ordinary scene object', () => {
    const platform = new Transform();
    const crate = new Transform();
    platform.addChild(crate);

    expect(isTerrainTransform(crate)).toBe(false);
  });

  it('rejects null', () => {
    expect(isTerrainTransform(null)).toBe(false);
  });
});
