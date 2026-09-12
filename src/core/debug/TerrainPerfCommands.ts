import { Renderer } from 'rewild-renderer';

// Scene-pass GPU-time capture (#182). Terrain is not its own render pass — its
// LOD meshes draw through the main scene pass alongside all opaque geometry — so
// this times that whole pass. On a terrain-filling view it is dominated by
// terrain's fragment cost, which is what the sample-budget measurement watches.
//
// Mirrors startSkyPerfCapture: the monitor logs a console.table (label → ms)
// once per logIntervalMs while enabled, and is a no-op at zero cost when off.
export function registerTerrainPerfCommands(renderer: Renderer) {
  (window as any).startScenePerfCapture = () => {
    renderer.scenePerfMonitor.enabled = true;
    console.log(
      'Scene performance capture started — "shadow" is the directional shadow ' +
        'pass (all three cascades), "scene" is the main pass (terrain + opaque ' +
        'geometry + scatter). Point the camera at terrain to read its cost.'
    );
  };
  (window as any).stopScenePerfCapture = () => {
    renderer.scenePerfMonitor.enabled = false;
    console.log('Scene performance capture stopped');
  };
}
