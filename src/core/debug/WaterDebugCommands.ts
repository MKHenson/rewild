import { Renderer, createWaterQuerySample } from 'rewild-renderer';

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

  (window as any).setWaterHorizonSlope = (scale = 1) => {
    renderer.terrainRenderer.waterHorizonSlope = scale;
    console.log(
      `setWaterHorizonSlope(${scale}) — scale on the roughness of the sea past the terrain chunks, 1 matches the chunk water at range. Higher reads darker and duller at a grazing angle, 0 a mirror of the sky.`
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

  (window as any).setWaterRefractionDebug = (view: number | boolean = 1) => {
    const mode = view === true ? 1 : view === false ? 0 : view;
    renderer.terrainRenderer.waterRefractionDebug = mode;
    const views = [
      'water shaded',
      'three yes/no facts per water pixel. Red: the water map has the ground over 1 m below the surface. Green: the refraction capture has the scene over 0.5 m behind the surface. Blue: the capture makes the water over 1 m deep. Deep water reads white; a missing colour names the fact that fails',
      'the palette weights as read: red, green, blue for types 0, 1, 2; yellow where the four sum to under 0.5',
      'the share of the light behind the water that passes through it, as grey',
      'how far the drawn surface stands from the lens patch near the camera: red above it, green below, full at 2 cm; blue past the patch. Black means they agree',
    ];
    console.log(
      `setWaterRefractionDebug(${mode}) — ${views[mode] ?? 'unknown view'}.`
    );
  };

  // Reads the water query at a point, holding a probe for a few frames so the
  // wave height has landed. Defaults to the viewer's position.
  (window as any).waterAt = (x?: number, z?: number) => {
    const terrain = renderer.terrainRenderer;
    const px = x ?? terrain.viewerPosition.x;
    const pz = z ?? terrain.viewerPosition.z;
    const query = terrain.waterQuery;
    const probe = query.acquireProbe();
    if (probe < 0) {
      console.log('waterAt — every probe is taken.');
      return;
    }
    const out = createWaterQuerySample();
    let frames = 0;
    const tick = () => {
      const loaded = query.sample(px, pz, out, probe);
      if (loaded && ++frames < 10) {
        requestAnimationFrame(tick);
        return;
      }
      query.releaseProbe(probe);
      console.log(
        `waterAt(${px.toFixed(1)}, ${pz.toFixed(1)})${loaded ? '' : ' — ground not loaded'}:`,
        { ...out, typeWeights: Array.from(out.typeWeights) }
      );
    };
    tick();
  };

  // Reads back the UnderWater uniform and finds, down the screen's centre
  // column, the row where the lens test (under-water.wgsl) crosses the
  // waterline, by the drawn-grid patch and by the camera probe's level alone.
  (window as any).lensWaterline = async () => {
    const terrain = renderer.terrainRenderer;
    const u = await terrain.underWater.read(renderer.device);
    const side = 4;
    const eyeY = u[1];
    const probeY = u[5];
    const [near, spacing, firstX, firstZ] = [u[24], u[25], u[26], u[27]];
    const m = u.subarray(28, 44);
    const up = [m[4], m[5], m[6]];
    const forward = [-m[8], -m[9], -m[10]];
    const vertex = (i: number, j: number) => {
      const o = 44 + (j * side + i) * 4;
      return u[o + 1] > -1e29 ? [u[o + 2], u[o + 1], u[o + 3]] : [0, probeY, 0];
    };
    const patchAt = (x: number, z: number) => {
      const px = Math.min(Math.max(x, 0), side - 1);
      const pz = Math.min(Math.max(z, 0), side - 1);
      const cx = Math.min(Math.floor(px), side - 2);
      const cz = Math.min(Math.floor(pz), side - 2);
      const fx = px - cx;
      const fz = pz - cz;
      const a = vertex(cx, cz);
      const b = vertex(cx + 1, cz);
      const c = vertex(cx, cz + 1);
      if (fx + fz <= 1)
        return a.map((v, k) => v + (b[k] - v) * fx + (c[k] - v) * fz);
      const d = vertex(cx + 1, cz + 1);
      return d.map((v, k) => v + (c[k] - v) * (1 - fx) + (b[k] - v) * (1 - fz));
    };
    const rows = renderer.canvas.height;
    const tanHalf = Math.tan((renderer.camera.fov * Math.PI) / 360);
    let patchRow = -1;
    let probeRow = -1;
    let lastPatch = NaN;
    let lastProbe = NaN;
    const depths: { row: number; patch: number; probe: number }[] = [];
    for (let row = 0; row < rows; row++) {
      const ndc = 1 - (2 * (row + 0.5)) / rows;
      const offset = forward.map((f, k) => (f + up[k] * ndc * tanHalf) * near);
      const lensY = eyeY + offset[1];
      const gx = (offset[0] - firstX) / spacing;
      const gz = (offset[2] - firstZ) / spacing;
      let s = patchAt(gx, gz);
      for (let i = 0; i < 6; i++)
        s = patchAt(gx - s[0] / spacing, gz - s[2] / spacing);
      const patch = s[1] - lensY;
      const probe = probeY - lensY;
      if (patchRow < 0 && lastPatch <= 0 && patch > 0) patchRow = row;
      if (probeRow < 0 && lastProbe <= 0 && probe > 0) probeRow = row;
      lastPatch = patch;
      lastProbe = probe;
      if (row % Math.round(rows / 8) === 0) depths.push({ row, patch, probe });
    }
    const heights: number[][] = [];
    for (let j = 0; j < side; j++)
      heights.push(
        Array.from({ length: side }, (_, i) => +vertex(i, j)[1].toFixed(4))
      );
    console.log(
      `lensWaterline — ${rows} rows. Waterline row by the patch: ${patchRow}, by the camera probe's level: ${probeRow}. Eye ${eyeY.toFixed(4)}, probe surface ${probeY.toFixed(4)}, near ${near}, spacing ${spacing}, first vertex ${firstX.toFixed(3)}, ${firstZ.toFixed(3)} from the eye.`,
      '\nPatch vertex heights, +x across, +z down:',
      heights,
      '\nMetres of water over the lens down the centre column:',
      depths
    );
  };

  (window as any).setWaterLens = (override = {}) => {
    const lens = renderer.terrainRenderer.waterLens;
    lens.settings = { ...lens.settings, ...override };
    console.log(
      'setWaterLens — water on the lens is now',
      lens.settings,
      '\nKeys: underWater, the blur radius over the frame height where the lens is in water in a calm (0 clear, as goggles); underWaterGale, the same at windiness 1, ramping between; recovery, seconds the view takes to clear after surfacing; wind, the blur radius over the frame height at the corners in full wind; windStart, the windiness 0..1 it starts at; windClear, 0..1 of the way to the corners it starts (below 0 it reaches the centre); windSwing, how far windClear swings either way as the eye refocuses.'
    );
  };

  (window as any).setWaterCaustics = (override = {}) => {
    const caustics = renderer.terrainRenderer.caustics;
    caustics.settings = { ...caustics.settings, ...override };
    console.log(
      'setWaterCaustics — caustics are now',
      caustics.settings,
      '\nKeys: strength, 0..1 how strongly the waves focus the sun (0 off); shallow and deep, metres down to the two planes the light lands on.'
    );
  };

  (window as any).setWaterShafts = (strength = 1) => {
    renderer.terrainRenderer.lightShafts.strength = strength;
    console.log(
      `setWaterShafts(${strength}) — scale on the light shafts under water, 1 the physical answer, 0 off.`
    );
  };

  (window as any).setMarineSnow = (override = {}) => {
    const snow = renderer.terrainRenderer.marineSnow;
    snow.settings = { ...snow.settings, ...override };
    console.log(
      'setMarineSnow — marine snow is now',
      snow.settings,
      '\nKeys: count, specks at full quality; box, metres the box around the camera spans; size, metres a speck spans; minPixels; opacity; brightness; current, [x, y, z] metres a second.'
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
