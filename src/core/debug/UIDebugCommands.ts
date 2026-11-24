import {
  Button,
  glassSurface,
  Label,
  printFocus,
  printTree,
  UISurface,
} from 'rewild-gpu-ui';
import { Vector3 } from 'rewild-common';
import { Renderer } from 'rewild-renderer';

/** How far in front of the camera a test panel stands, in metres. */
const PANEL_DISTANCE = 2;

// Mica debug tools: the layout overlay, the tree of each surface, where keys
// and pointers go, and test panels in the world. The perf panel shows what the
// UI costs.
export function registerUIDebugCommands(renderer: Renderer) {
  const panels: UISurface[] = [];

  (window as any).addUIWorldPanel = () => {
    const surface = createWorldPanel(renderer, panels.length + 1);
    panels.push(surface);
    console.log(
      `Added "${surface.name}" ${PANEL_DISTANCE} m in front of the camera. ` +
        'Walk round it to see its back. Look at its button and click, or press E or A, to use it. ' +
        'clearUIWorldPanels() removes them all.'
    );
  };

  (window as any).clearUIWorldPanels = () => {
    for (const surface of panels) renderer.ui.removeSurface(surface);
    console.log(`Removed ${panels.length} world panel(s).`);
    panels.length = 0;
  };

  (window as any).setUILayoutOverlay = (enabled?: boolean) => {
    if (typeof enabled !== 'boolean') {
      console.log(
        `setUILayoutOverlay(bool) — currently ${renderer.ui.showLayout}. ` +
          'Draws the box, margin, padding and clip of each UI node.'
      );
      return;
    }
    renderer.ui.showLayout = enabled;
    console.log(`UI layout overlay ${enabled ? 'ON' : 'OFF'}`);
  };

  (window as any).printUITree = (name?: string) => {
    const surfaces = renderer.ui.surfaces;
    const shown = name ? surfaces.filter((s) => s.name === name) : surfaces;
    if (!shown.length) {
      console.log(
        `printUITree(name?) — no surface named "${name}". Surfaces: ` +
          surfaces.map((s) => s.name).join(', ')
      );
      return;
    }
    console.log(shown.map(printTree).join('\n\n'));
  };

  (window as any).printUIFocus = () => {
    console.log(printFocus(renderer.ui.surfaces, renderer.ui.input));
  };
}

/**
 * A glass panel of 0.8 by 0.5 m that stands upright in front of the camera
 * and faces it. The look-at pointer clicks its button, which logs the click.
 */
function createWorldPanel(renderer: Renderer, index: number): UISurface {
  const surface = renderer.ui.createSurface({
    kind: 'world',
    name: `world-panel-${index}`,
    size: { width: 0.8, height: 0.5 },
  });
  const root = surface.root;
  Object.assign(root.style, {
    ...glassSurface(),
    borderWidth: 1,
    borderColor: 'glassEdge',
    borderRadius: 14,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    padding: 32,
  });
  root.append(
    new Label({
      text: 'World surface',
      style: { color: 'onSurface', fontSize: 40, fontWeight: 'bold' },
    }).node,
    new Label({
      text: 'Walk round me. From behind I am plain glass, and the terrain can hide me.',
      style: {
        color: 'onSurfaceLight',
        fontSize: 22,
        textAlign: 'center',
        alignSelf: 'stretch',
      },
    }).node,
    new Button({
      label: 'Open Portal',
      style: { width: 240 },
      onClick: () => console.log(`Clicked the button of "${surface.name}".`),
    }).node
  );

  // Upright, facing the camera across the ground, so it turns only about y.
  const camera = renderer.camera.camera.transform;
  const back = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
  back.y = 0;
  if (back.lengthSq() === 0) back.set(0, 0, 1);
  back.normalize();
  const up = new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(up, back);
  const position = back
    .clone()
    .multiplyScalar(-PANEL_DISTANCE)
    .add(camera.position);
  surface.worldMatrix
    .makeBasis(right, up, back)
    .setPosition(position.x, position.y, position.z);
  return surface;
}
