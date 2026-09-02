import { Frustum, Matrix4 } from 'rewild-common';
import { SceneBVH } from './SceneBVH';
import { Transform } from '../core/Transform';
import { Geometry } from '../geometry/Geometry';
import { IS_VISUAL_COMPONENT } from '../typeGuards';

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
  // transform never enters the tree, and turning it visible again does not put
  // it back, because nothing bumped structureVersion. Anything that culls per
  // frame therefore has to use its component's own `visible` flag — see
  // ChunkScatter.updateVisibility.
  it('drops an invisible transform and does not take it back on its own', () => {
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
    bvh.markDirty();
    bvh.update();
    expect(bvh.frustumCull(everythingFrustum(), [])).not.toContain(child);

    // Visible again, but no structural change — the tree is not rebuilt, so the
    // object stays missing.
    child.visible = true;
    bvh.update();
    expect(bvh.frustumCull(everythingFrustum(), [])).not.toContain(child);

    // Only a structure change brings it back.
    scene.addChild(visualTransform('another'));
    scene.updateMatrixWorld();
    bvh.update();
    expect(bvh.frustumCull(everythingFrustum(), [])).toContain(child);
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
