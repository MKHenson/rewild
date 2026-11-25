import { Button, UIInput, UISurface } from 'rewild-gpu-ui';
import { PerspectiveCamera } from 'rewild-renderer';
import { MOUSE_RAY_ID, MouseRay } from './MouseRay';

/** A world panel 1 m in front of a camera at the origin, with one button. */
function setup() {
  const surface = new UISurface({
    kind: 'world',
    name: 'panel',
    size: { width: 0.4, height: 0.4 },
  });
  surface.worldMatrix.makeTranslation(0, 0, -1);
  const clicks: string[] = [];
  const button = new Button({
    label: 'Unlock',
    style: { width: 400, height: 400 },
    onClick: () => clicks.push('unlock'),
  });
  surface.root.append(button.node);
  surface.update(surface.layoutWidth, surface.layoutHeight);
  const input = new UIInput({ surfaces: [surface] });

  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.camera.transform.updateMatrixWorld();
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 200 } as DOMRect);
  const ray = new MouseRay(input, camera);
  ray.attach(canvas);
  return { canvas, ray, input, clicks };
}

// jsdom has no PointerEvent. The ray reads the mouse fields and the type.
function point(canvas: HTMLElement, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  canvas.dispatchEvent(event);
}

describe('MouseRay', () => {
  it('clicks a world button under the mouse', () => {
    const { canvas, clicks } = setup();
    point(canvas, 'pointerdown', 100, 100);
    point(canvas, 'pointerup', 100, 100);
    expect(clicks).toEqual(['unlock']);
  });

  it('misses past the edge of the panel', () => {
    const { canvas, clicks } = setup();
    point(canvas, 'pointerdown', 5, 5);
    point(canvas, 'pointerup', 5, 5);
    expect(clicks).toEqual([]);
  });

  it('stops pointing once it is detached', () => {
    const { canvas, ray, input, clicks } = setup();
    point(canvas, 'pointermove', 100, 100);
    expect(input.pointerTarget(MOUSE_RAY_ID)).not.toBeNull();
    ray.detach();
    expect(input.pointerTarget(MOUSE_RAY_ID)).toBeNull();
    point(canvas, 'pointerdown', 100, 100);
    point(canvas, 'pointerup', 100, 100);
    expect(clicks).toEqual([]);
  });
});
