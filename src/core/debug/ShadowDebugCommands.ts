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

  // Spot-shadow bypass. The spot's contribution is multiplied by its shadow
  // factor *inside* the shaded output — and inside the `direct` material debug
  // channel too — so a beam that the shadow map is wrongly rejecting and a beam
  // that never reached the surface look the same. Turning this off leaves the
  // light and takes the map away, which tells the two apart in one A/B.
  (window as any).setSpotShadowEnabled = (enabled?: boolean) => {
    const spot = renderer.spotLightShadowRenderer;
    if (enabled === undefined) {
      console.log(
        `setSpotShadowEnabled(bool) — currently ${spot.enabled}. ` +
          `false = flashlight lights everything it reaches, unshadowed.`
      );
      return;
    }
    spot.enabled = enabled;
    console.log(`Spot light shadows ${enabled ? 'ON' : 'OFF (unshadowed)'}`);
  };
}
