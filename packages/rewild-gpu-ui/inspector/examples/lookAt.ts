import {
  Button,
  glassSurface,
  Label,
  UILookPointer,
  UISurface,
} from '../../lib';
import { exampleCameraDistance } from '../camera';
import { example, ExampleView } from '../registry';

const part = 'Look-at pointer';

/** Seconds for one full move. */
const PERIOD = 8;

/**
 * A glass panel that fills the surface, with a title and a button that logs
 * its clicks. The button is in the centre of the panel, where the ray points.
 */
function panel(surface: UISurface, title: string, log: (line: string) => void) {
  Object.assign(surface.root.style, {
    ...glassSurface(),
    borderWidth: 1,
    borderColor: 'glassEdge',
    borderRadius: 14,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  });
  const button = new Button({
    label: 'Open Portal',
    style: { width: 200 },
    onClick: () => log('click'),
  });
  button.node.on('pointerenter', () => log('pointerenter'));
  button.node.on('pointerleave', () => log('pointerleave'));
  surface.root.append(
    new Label({
      text: title,
      // Out of the flow, so the button alone sets the centre.
      style: {
        position: 'absolute',
        top: 32,
        color: 'onSurface',
        fontSize: 28,
        fontWeight: 'bold',
      },
    }).node,
    button.node
  );
}

/**
 * A look-at pointer whose ray goes from the example's camera through the
 * centre of the canvas. A press of the main button on the canvas, or E while
 * the canvas has focus, clicks.
 */
function lookPointer(view: ExampleView): () => void {
  const { canvas, surface } = view;
  const look = new UILookPointer(view);
  const eye = { x: 0, y: 0, z: 0 };
  const forward = { x: 0, y: 0, z: -1 };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 0) look.press('mouse');
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button === 0) look.release('mouse');
  });
  canvas.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && !e.repeat) look.press('key');
  });
  canvas.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') look.release('key');
  });
  return () => {
    eye.z = exampleCameraDistance(surface.size, canvas.width / canvas.height);
    look.aim(eye, forward);
  };
}

example({
  part,
  name: 'Look at a button',
  description:
    'A ray goes from the camera through the centre of the view. The panel slides from side to side. While the ray is on the button, the crosshair shows and the button lights. Press the main button on the canvas, or E while it has focus, to click.',
  height: 320,
  backdrop: true,
  log: true,
  world: { width: 0.6, height: 0.4 },
  build: (view) => {
    panel(view.surface, 'Look at me', view.log);
    const aim = lookPointer(view);
    return (seconds) => {
      const x = 0.25 * Math.sin((seconds / PERIOD) * Math.PI * 2);
      view.surface.worldMatrix.makeTranslation(x, 0, 0);
      aim();
    };
  },
});

example({
  part,
  name: 'Reach and the back',
  description:
    'The panel turns once and moves from its place to 4 m behind it, then back. The ray reaches 3 m. Past reach, or from behind, the crosshair does not show and the button does not light.',
  height: 320,
  backdrop: true,
  log: true,
  world: { width: 0.6, height: 0.4 },
  build: (view) => {
    panel(view.surface, 'Reach', view.log);
    const aim = lookPointer(view);
    return (seconds) => {
      const t = (seconds / (PERIOD * 2)) % 1;
      const away = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
      view.surface.worldMatrix
        .makeRotationY(t * Math.PI * 2)
        .setPosition(0, 0, -away * 4);
      aim();
    };
  },
});
