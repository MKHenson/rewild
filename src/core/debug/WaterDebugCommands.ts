import { Renderer } from 'rewild-renderer';

// Water surface inspection. An artefact on the water can come from the waves
// displacing the grid or from the per-pixel normal shading it; these pull the
// two apart.
export function registerWaterDebugCommands(renderer: Renderer) {
  (window as any).setWaterWaveGeometry = (enabled = true) => {
    renderer.terrainRenderer.waterWaveGeometry = enabled;
    console.log(
      `setWaterWaveGeometry(${enabled}) — waves ${
        enabled ? 'displace the grid and shade it' : 'shade a flat grid only'
      }. An artefact that survives with this off is in the shading.`
    );
  };

  (window as any).setWaterWaveNormals = (enabled = true) => {
    renderer.terrainRenderer.waterWaveNormals = enabled;
    console.log(
      `setWaterWaveNormals(${enabled}) — waves ${
        enabled ? 'shade the normal' : 'leave the normal flat'
      }. An artefact that survives with both this and setWaterWaveGeometry off is not in the waves.`
    );
  };
}
