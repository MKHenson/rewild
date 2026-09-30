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

  (window as any).setWaterShoreWaves = (strength = 1) => {
    renderer.terrainRenderer.waterShoreWaves = strength;
    console.log(
      `setWaterShoreWaves(${strength}) — scale on the height of the waves rolling in to the coast, 1 the default, 0 off.`
    );
  };

  (window as any).setWaterSwash = (strength = 1) => {
    renderer.terrainRenderer.waterSwash = strength;
    console.log(
      `setWaterSwash(${strength}) — scale on how far the water runs up the beach after a wave breaks, 1 the default, 0 off.`
    );
  };

  (window as any).setWaterWetBand = (strength = 1) => {
    renderer.terrainRenderer.waterWetBand = strength;
    console.log(
      `setWaterWetBand(${strength}) — strength of the damp, glossy ground above the water, 1 the default, 0 off.`
    );
  };

  (window as any).setWaterShoreDebug = (enabled = true) => {
    renderer.terrainRenderer.waterShoreDebug = enabled;
    console.log(
      `setWaterShoreDebug(${enabled}) — ${
        enabled
          ? 'blue where deep water reaches, red by how strongly shore waves show, green stripes on the crests rolling in'
          : 'water shaded'
      }.`
    );
  };

  (window as any).shoreFieldStats = () => {
    const field = renderer.terrainRenderer.shoreField;
    const { water, sources, reached, sourceDepth, longest } = field.stats;
    console.log(
      `Shore field at (${field.centreX}, ${field.centreZ}): ${water} ocean texels, ${sources} deep enough to start waves (${sourceDepth.toFixed(1)} m or more), ${reached} reached, longest trip ${longest.toFixed(1)} s.`
    );
  };

  // Samples the shore field's grid again as its depth sampler does, and counts
  // why each texel reads as no ocean.
  (window as any).shoreFieldProbe = () => {
    const terrain = renderer.terrainRenderer as any;
    const field = terrain.shoreField;
    const span: number = terrain.chunkSize;
    const texels = 256;
    const texel = 8;
    const counts = {
      noChunk: 0,
      noHeights: 0,
      noWaterMap: 0,
      aboveSea: 0,
      notOcean: 0,
      ocean: 0,
    };
    let deepestOcean = 0;
    let deepestOceanAt = '';
    let deepestAny = 0;
    let deepestAnyAt = '';
    let deepNotOcean = 0;
    const missing = new Set<string>();
    for (let y = 0; y < texels; y++)
      for (let x = 0; x < texels; x++) {
        const wx = field.centreX - (texels * texel) / 2 + texel / 2 + x * texel;
        const wz = field.centreZ - (texels * texel) / 2 + texel / 2 + y * texel;
        const cx = Math.round(wx / span);
        const cy = Math.round(wz / span);
        const chunk = terrain.terrainChunks.get(`${cx},${cy}`);
        if (!chunk) {
          counts.noChunk++;
          missing.add(`${cx},${cy}`);
          continue;
        }
        if (!chunk.heights) {
          counts.noHeights++;
          continue;
        }
        const depth =
          terrain._seaLevel - terrain.chunkHeight(chunk.heights, cx, cy, wx, wz);
        if (depth > deepestAny) {
          deepestAny = depth;
          deepestAnyAt = `(${wx}, ${wz}) chunk ${cx},${cy}`;
        }
        const water = chunk.water;
        if (!water) {
          counts.noWaterMap++;
          continue;
        }
        if (depth <= 0) {
          counts.aboveSea++;
          continue;
        }
        const n = (terrain.mapChunkSizeLod - 1) / water.step;
        const mx = Math.round(((wx - cx * span + span / 2) / span) * n);
        const my = Math.round(((cy * span + span / 2 - wz) / span) * n);
        const t =
          Math.min(water.size - 1, Math.max(0, mx)) +
          Math.min(water.size - 1, Math.max(0, my)) * water.size;
        const ocean =
          water.coverage[t] * water.typeWeights[t * 4 + terrain.oceanType];
        if (ocean < 0.5 * 255 * 255) {
          counts.notOcean++;
          if (depth >= 24) deepNotOcean++;
          continue;
        }
        counts.ocean++;
        if (depth > deepestOcean) {
          deepestOcean = depth;
          deepestOceanAt = `(${wx}, ${wz}) chunk ${cx},${cy}`;
        }
      }
    console.log(
      `Shore field probe at (${field.centreX}, ${field.centreZ}), ocean type ${terrain.oceanType}, sea level ${terrain._seaLevel}:`,
      counts,
      `\nDeepest ocean ${deepestOcean.toFixed(1)} m at ${deepestOceanAt}.`,
      `\nDeepest below sea level of any kind ${deepestAny.toFixed(1)} m at ${deepestAnyAt}.`,
      `\n${deepNotOcean} texels 24 m or deeper rejected as not ocean.`,
      `\nChunks missing: ${[...missing].join(' ') || 'none'}.`,
      '\nLast build:',
      { ...field.stats }
    );
  };

  (window as any).setSeaSpray =(override = {}) => {
    const spray = renderer.terrainRenderer.seaSpray;
    if (!spray) {
      console.log('setSeaSpray — no spray yet. Go near water first.');
      return;
    }
    const { moderate, storm, surf, impact, ...rest } = override as any;
    spray.settings = {
      ...spray.settings,
      ...rest,
      moderate: { ...spray.settings.moderate, ...moderate },
      storm: { ...spray.settings.storm, ...storm },
      surf: { ...spray.settings.surf, ...surf },
      impact: { ...spray.settings.impact, ...impact },
    };
    console.log(
      'setSeaSpray — the spray is now',
      spray.settings,
      '\nKeys: moderate and storm, each { size (m), rise (m), lifetime (s), opacity 0..1 }, blended from windiness 0.7 to 1. Also spawnFoam 0..1, reach (m), minWindiness 0..1, drift (m/s). reach also sets the depth mask span. Shore: surf and impact, the same shape keys at full strength; shoreShare 0..1 of the pool, surfMinWindiness 0..1, impactMinHeight (m), shoreFullHeight (m).'
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
