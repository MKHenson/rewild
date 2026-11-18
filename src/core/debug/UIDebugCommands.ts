import { printFocus, printTree } from 'rewild-gpu-ui';
import { Renderer } from 'rewild-renderer';

// Mica debug tools: the layout overlay, the tree of each surface, and where
// keys and pointers go. The perf panel shows what the UI costs.
export function registerUIDebugCommands(renderer: Renderer) {
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
