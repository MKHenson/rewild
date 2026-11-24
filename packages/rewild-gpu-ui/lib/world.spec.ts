import { Matrix4, Vector3 } from 'rewild-common';
import { UINode } from './UINode';
import { UISurface } from './UISurface';
import {
  outsideView,
  rayToSurface,
  screenClip,
  surfaceToLocal,
  worldClip,
} from './world';

/** The surface point `x`, `y` through `m`, after the divide by w. */
function project(m: Matrix4, x: number, y: number): number[] {
  const p = new Vector3(x, y, 0).applyMatrix4(m);
  return [p.x, p.y, p.z];
}

function close(actual: number[], expected: number[], digits = 5): void {
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, digits));
}

function translation(x: number, y: number, z: number): Matrix4 {
  return new Matrix4().makeTranslation(x, y, z);
}

/** The game camera's projection, with a 60° field of view and a square view. */
const camera = new Matrix4().makePerspective(
  -0.1 * Math.tan(Math.PI / 6),
  0.1 * Math.tan(Math.PI / 6),
  0.1 * Math.tan(Math.PI / 6),
  -0.1 * Math.tan(Math.PI / 6),
  0.1,
  100
);

describe('screenClip', () => {
  it('maps the corners of the surface to the corners of clip space', () => {
    const m = screenClip(new Matrix4(), 200, 100);
    close(project(m, 0, 0), [-1, 1, 0]);
    close(project(m, 200, 100), [1, -1, 0]);
    close(project(m, 100, 50), [0, 0, 0]);
  });
});

describe('surfaceToLocal', () => {
  it('centres the surface on its origin, in metres, with y up', () => {
    const m = surfaceToLocal(new Matrix4(), { width: 0.8, height: 0.5 }, 1000);
    close(project(m, 0, 0), [-0.4, 0.25, 0]);
    close(project(m, 800, 500), [0.4, -0.25, 0]);
    close(project(m, 400, 250), [0, 0, 0]);
  });
});

describe('worldClip', () => {
  const size = { width: 1, height: 0.5 };
  const clipFor = (world: Matrix4) =>
    worldClip(new Matrix4(), camera, world, size, 1000);

  it('puts a surface in front of the camera in the middle of the view', () => {
    const clip = clipFor(translation(0, 0, -2));
    close(project(clip, 500, 250), [0, 0]);
    // The surface's right edge is to the right, and its top is up.
    expect(project(clip, 1000, 250)[0]).toBeGreaterThan(0);
    expect(project(clip, 500, 0)[1]).toBeGreaterThan(0);
    expect(outsideView(clip, 1000, 500)).toBe(false);
  });

  it('culls a surface behind the camera or off to one side', () => {
    expect(outsideView(clipFor(translation(0, 0, 2)), 1000, 500)).toBe(true);
    expect(outsideView(clipFor(translation(20, 0, -2)), 1000, 500)).toBe(true);
  });

  it('keeps a surface that crosses the edge of the view', () => {
    expect(outsideView(clipFor(translation(1.2, 0, -2)), 1000, 500)).toBe(
      false
    );
  });

  it('shows the back of a surface turned half round', () => {
    const turned = new Matrix4().makeRotationY(Math.PI).setPosition(0, 0, -2);
    const clip = clipFor(turned);
    // From behind, the surface's left edge is on the right of the view.
    expect(project(clip, 0, 250)[0]).toBeGreaterThan(0);
    expect(outsideView(clip, 1000, 500)).toBe(false);
  });
});

describe('UISurface in the world', () => {
  it('lays out at its size in metres times its pixels per metre', () => {
    const surface = new UISurface({
      kind: 'world',
      name: 'panel',
      size: { width: 0.8, height: 0.5 },
    });
    expect(surface.layoutWidth).toBe(800);
    expect(surface.layoutHeight).toBe(500);
    const child = new UINode({ style: { width: '50%', height: '50%' } });
    surface.root.append(child);
    surface.update(surface.layoutWidth, surface.layoutHeight);
    expect(child.rect).toMatchObject({ width: 400, height: 250 });

    surface.pixelsPerMetre = 500;
    expect(surface.layoutWidth).toBe(400);
  });

  it('keeps its own copy of the size', () => {
    const size = { width: 1, height: 1 };
    const surface = new UISurface({ kind: 'world', name: 'panel', size });
    size.width = 2;
    expect(surface.size.width).toBe(1);
  });
});

describe('rayToSurface', () => {
  const size = { width: 0.8, height: 0.5 };
  const forward = { x: 0, y: 0, z: -1 };

  it('finds the surface pixel a ray meets from the front', () => {
    const world = translation(0, 1, -2);
    const hit = rayToSurface({ x: 0, y: 1, z: 0 }, forward, world, size, 1000);
    expect(hit).not.toBeNull();
    close([hit!.x, hit!.y, hit!.distance], [400, 250, 2], 3);
    expect(hit!.front).toBe(true);
    // 0.1 m right and 0.1 m up is 100 px right and 100 px nearer the top.
    const off = rayToSurface(
      { x: 0.1, y: 1.1, z: 0 },
      forward,
      world,
      size,
      1000
    );
    close([off!.x, off!.y], [500, 150], 3);
  });

  it('gives a point off the surface, for a pointer that a node captured', () => {
    const hit = rayToSurface(
      { x: 1, y: 0, z: 0 },
      forward,
      translation(0, 0, -2),
      size,
      1000
    );
    close([hit!.x, hit!.y], [1400, 250], 3);
  });

  it('marks a ray that meets the back of a turned surface', () => {
    const turned = new Matrix4().makeRotationY(Math.PI).setPosition(0, 0, -2);
    const hit = rayToSurface(
      { x: 0.1, y: 0, z: 0 },
      forward,
      turned,
      size,
      1000
    );
    expect(hit!.front).toBe(false);
    // From behind, the surface's left edge is on the right.
    close([hit!.x], [300], 3);
  });

  it('misses a surface behind the ray or parallel to it', () => {
    const world = translation(0, 0, -2);
    const back = { x: 0, y: 0, z: 1 };
    expect(
      rayToSurface({ x: 0, y: 0, z: 0 }, back, world, size, 1000)
    ).toBeNull();
    const side = { x: 1, y: 0, z: 0 };
    expect(
      rayToSurface({ x: 0, y: 0, z: 0 }, side, world, size, 1000)
    ).toBeNull();
  });
});
