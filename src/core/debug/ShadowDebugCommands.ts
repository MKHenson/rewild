import { Renderer } from 'rewild-renderer';

// Directional-shadow cascade debug toggles (moved out of
// DirectionalShadowRenderer.init so all debug commands live together).
export function registerShadowDebugCommands(renderer: Renderer) {
  (window as any).startShadowDebug = () => {
    const shadows = renderer.directionalShadowRenderer;
    if (!shadows.debugRenderer) {
      console.warn('Shadow renderer not initialised yet.');
      return;
    }
    shadows.debugMode = true;
    shadows.debugRenderer.enabled = true;
    console.log(
      'Shadow debug ON — cascade tint: red=0 green=1 blue=2 | atlas viewer: bottom-left'
    );
  };
  (window as any).stopShadowDebug = () => {
    const shadows = renderer.directionalShadowRenderer;
    if (!shadows.debugRenderer) return;
    shadows.debugMode = false;
    shadows.debugRenderer.enabled = false;
    console.log('Shadow debug OFF');
  };
}
