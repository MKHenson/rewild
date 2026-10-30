import { Box3, Frustum, Matrix4, Vector3 } from 'rewild-common';
import { SceneBVH } from './SceneBVH';
import { Transform } from '../core/Transform';
import { Geometry } from '../geometry/Geometry';
import { IS_VISUAL_COMPONENT } from '../typeGuards';
import { Raycaster } from '../core/Raycaster';

function visualTransform(name: string): Transform {
  const geometry = new Geometry();
  geometry.vertices = new Float32Array([-1, -1, -1, 1, 1, 1]);

  const transform = new Transform();
  transform.name = name;
  transform.component = {
    [IS_VISUAL_COMPONENT]: true,
    transform,
    geometry,
    material: {} as never,
    visible: true,
    raycast: () => {},
  } as never;

  return transform;
}

// A frustum wide enough to keep everything, so the tests are about membership
// rather than about culling.
function everythingFrustum(): Frustum {
  const projection = new Matrix4();
  projection.makeOrthographic(-1000, 1000, 1000, -1000, -1000, 1000);
  return new Frustum().setFromProjectionMatrix(projection);
}

describe('SceneBVH membership', () => {
  // transform.visible is read as membership, not as culling: an invisible
  // transform never enters the tree. Changing it bumps structureVersion, so
  // the tree rebuilds and takes it back. Anything that culls per frame should
  // still use its component's own `visible` flag, which needs no rebuild —
  // see ChunkScatter.updateVisibility.
  it('drops an invisible transform and takes it back when shown', () => {
    const scene = new Transform();
    const child = visualTransform('child');
    // A resident sibling, so the tree never empties — an empty root forces a
    // rebuild on the next update and would mask the staleness under test.
    scene.addChild(visualTransform('sibling'));
    scene.addChild(child);
    scene.updateMatrixWorld();

    const bvh = new SceneBVH(scene);
    bvh.update();
    expect(bvh.frustumCull(everythingFrustum(), [])).toContain(child);

    child.visible = false;
    bvh.update();
    expect(bvh.frustumCull(everythingFrustum(), [])).not.toContain(child);

    child.visible = true;
    bvh.update();
    expect(bvh.frustumCull(everythingFrustum(), [])).toContain(child);
  });

  it('takes back a child shown under a parent that was hidden', () => {
    const scene = new Transform();
    const parent = new Transform();
    const child = visualTransform('child');
    parent.addChild(child);
    scene.addChild(visualTransform('sibling'));
    scene.addChild(parent);
    scene.updateMatrixWorld();

    const bvh = new SceneBVH(scene);
    parent.visible = false;
    bvh.update();
    expect(bvh.frustumCull(everythingFrustum(), [])).not.toContain(child);

    parent.visible = true;
    bvh.update();
    expect(bvh.frustumCull(everythingFrustum(), [])).toContain(child);
  });

  it('does not rebuild when visibility is set to what it already is', () => {
    const scene = new Transform();
    const version = scene.structureVersion;
    scene.visible = true;
    expect(scene.structureVersion).toBe(version);
  });

  it('keeps a transform whose component is merely marked invisible', () => {
    const scene = new Transform();
    const child = visualTransform('child');
    scene.addChild(child);
    scene.updateMatrixWorld();

    const bvh = new SceneBVH(scene);
    bvh.update();

    (child.component as unknown as { visible: boolean }).visible = false;
    bvh.update();

    // Still a member — organizeVisuals is what skips it, so it comes back the
    // moment the flag flips with no rebuild needed.
    expect(bvh.frustumCull(everythingFrustum(), [])).toContain(child);
  });
});

describe('SceneBVH raycast', () => {
  it('reaches objects in range when the ray starts inside a box that reaches past far', () => {
    const scene = new Transform();
    const huge = visualTransform('huge');
    (huge.component as unknown as { localBounds: Box3 }).localBounds = new Box3(
      new Vector3(-1e7, -1e4, -1e7),
      new Vector3(1e7, 1e4, 1e7)
    );
    const target = visualTransform('target');
    target.position.set(0, 0, -10);
    const hit: Transform[] = [];
    (target.component as unknown as { raycast: () => void }).raycast = () =>
      hit.push(target);
    scene.addChild(huge);
    scene.addChild(target);
    scene.updateMatrixWorld();

    const bvh = new SceneBVH(scene);
    bvh.update();

    const raycaster = new Raycaster(
      new Vector3(0, 0, 0),
      new Vector3(0, 0, -1),
      0,
      4000
    );
    bvh.raycast(raycaster, []);
    expect(hit.map((t) => t.name)).toEqual(['target']);
  });
});
