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

  (window as any).setWaterFoamDebug = (enabled = true) => {
    renderer.terrainRenderer.waterFoamDebug = enabled;
    console.log(
      `setWaterFoamDebug(${enabled}) — ${
        enabled ? 'water shows its raw foam coverage in grey' : 'water shaded'
      }. Black means the ocean makes none there.`
    );
  };

  (window as any).setWaterCrestGlow = (strength = 1) => {
    renderer.terrainRenderer.waterCrestGlow = strength;
    console.log(
      `setWaterCrestGlow(${strength}) — sunlight through the wave crests, 1 the default, 0 off. Look toward the sun to see it.`
    );
  };

  (window as any).setWaterTroughDarkening = (strength = 1) => {
    renderer.terrainRenderer.waterTroughDarkening = strength;
    console.log(
      `setWaterTroughDarkening(${strength}) — how much darker troughs are than crests, 1 the default, 0 off.`
    );
  };

  (window as any).setSeaSpray = (override = {}) => {
    const spray = renderer.terrainRenderer.seaSpray;
    if (!spray) {
      console.log('setSeaSpray — no spray yet. Go near water first.');
      return;
    }
    const { moderate, storm, ...rest } = override as any;
    spray.settings = {
      ...spray.settings,
      ...rest,
      moderate: { ...spray.settings.moderate, ...moderate },
      storm: { ...spray.settings.storm, ...storm },
    };
    console.log(
      'setSeaSpray — the spray is now',
      spray.settings,
      '\nKeys: moderate and storm, each { size (m), rise (m), lifetime (s), opacity 0..1 }, blended from windiness 0.7 to 1. Also spawnFoam 0..1, reach (m), minWindiness 0..1, drift (m/s). reach also sets the depth mask span.'
    );
  };

  (window as any).setOceanSeaState = (override = {}) => {
    const ocean = renderer.terrainRenderer.ocean;
    if (!ocean) {
      console.log('setOceanSeaState — no ocean yet. Go near water first.');
      return;
    }
    ocean.overrideSeaState(override);
    console.log(
      `setOceanSeaState(${JSON.stringify(override)}) — the wind sea is now`,
      ocean.currentSeaState(),
      '\nKeys: windSpeed (m/s), heightGain, omniShare 0..1, choppiness, longestPeak (m). {} goes back to the weather.'
    );
  };

  (window as any).setOceanFoam = (cascade: number, override = {}) => {
    const ocean = renderer.terrainRenderer.ocean;
    if (!ocean) {
      console.log('setOceanFoam — no ocean yet. Go near water first.');
      return;
    }
    if (cascade >= 0 && cascade < ocean.currentFoam().length)
      ocean.overrideFoam(cascade, override);
    console.log(
      'setOceanFoam — crest foam per cascade, longest first:',
      ocean.currentFoam(),
      '\nKeys: whitecap (foam grows where the Jacobian is below it; 1 flat, below 0 folded), amount 0..10 (growth and how long it lasts).'
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
