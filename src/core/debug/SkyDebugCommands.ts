import { Moon, Renderer } from 'rewild-renderer';

// Sky console commands (moved out of SkyRenderer.init so all debug commands
// live together). GPU timings are not here: they go to the perf panel.
export function registerSkyDebugCommands(renderer: Renderer) {
  (window as any).triggerLightning = (pos: [number, number, number]) => {
    renderer.sky.skyRenderer.triggerLightning(pos);
  };

  (window as any).setLightningFlash = (override = {}) => {
    const flash = renderer.sky.skyRenderer.flash;
    flash.settings = { ...flash.settings, ...override };
    console.log(
      'setLightningFlash — the flash is now',
      flash.settings,
      '\nKeys: light, radiance of the light from the bolt (the sun is 120); sky, radiance of the lit cloud deck (a clear day is about 7); glare, over the screen with the bolt ahead (0 none); linger, scale on how long the flicker lasts (1 about a second). triggerLightning([x, y, z]) to see it.'
    );
  };

  (window as any).toggleCloudShadowDebug = () => {
    const config = renderer.sky.skyRenderer.cloudShadowRenderer.config;
    console.log(
      `Cloud Shadow Map: ${config.resolution}x${config.resolution}, ` +
        `worldSize=${config.worldSize}m, updateFreq=every ${config.updateFrequency} frames`
    );
  };

  // Sky-driven IBL (Lichen phase 4).
  (window as any).showIblCubes = () => {
    renderer.sky.skyRenderer.cubeDebugRenderer.enabled = true;
    console.log(
      'IBL viewer ON. Rows bottom-up: captured sky, diffuse irradiance, ' +
        'prefiltered specular; BRDF map at the right of the top row. ' +
        'Faces left to right: +X -X +Y -Y +Z -Z.\n' +
        'Row 0 is exposed and tonemapped exactly as the frame is, so a tile ' +
        'should read like the sky above it. Row 1 should be smooth with no ' +
        'visible structure. Step setIblSpecularMip() through the chain to ' +
        'check row 2 blurs monotonically.'
    );
  };
  (window as any).hideIblCubes = () => {
    renderer.sky.skyRenderer.cubeDebugRenderer.enabled = false;
    console.log('IBL cube viewer OFF');
  };

  (window as any).setIblCubeExposureBias = (bias: number) => {
    renderer.sky.skyRenderer.cubeDebugRenderer.exposureBias = bias;
    console.log(
      `IBL cube viewer exposure bias ${bias}x ` +
        `(effective ${(renderer.camera.camera.exposure * bias).toFixed(4)})`
    );
  };

  (window as any).setSkyCaptureEnabled = (enabled: boolean) => {
    renderer.sky.skyRenderer.cubeCapture.enabled = enabled;
    console.log(`Sky cubemap capture ${enabled ? 'enabled' : 'disabled'}`);
  };

  (window as any).setIblSpecularMip = (mip: number) => {
    renderer.sky.skyRenderer.cubeDebugRenderer.specularMip = mip;
    console.log(
      `IBL viewer showing specular mip ${mip} ` +
        `(roughness ~${(mip / 7).toFixed(2)})`
    );
  };

  // Shading-side toggle: it zeroes the ambient every lit surface receives, which
  // is what separates a direct-lighting bug from an ambient one. Distinct from
  // setIblPrefilterEnabled below, which freezes the cubes but leaves whatever
  // they last held still lighting the scene.
  (window as any).setIblEnabled = (enabled: boolean) => {
    renderer.iblIntensity = enabled ? 1 : 0;
    console.log(`Sky IBL ambient ${enabled ? 'enabled' : 'disabled'}`);
  };

  (window as any).setIblIntensity = (intensity: number) => {
    renderer.iblIntensity = intensity;
    console.log(`Sky IBL ambient intensity ${intensity} (1 = physical)`);
  };

  (window as any).setIblPrefilterEnabled = (enabled: boolean) => {
    renderer.sky.skyRenderer.iblPrefilter.enabled = enabled;
    console.log(
      `IBL prefilter ${
        enabled ? 'enabled' : 'frozen'
      } — the cubes keep lighting ` +
        'the scene either way; use setIblEnabled(false) to remove ambient.'
    );
  };

  (window as any).skyCaptureStats = () => {
    const sky = renderer.sky.skyRenderer;
    const capture = sky.cubeCapture;
    const prefilter = sky.iblPrefilter;
    console.log(
      `Sky capture: ${capture.enabled ? 'on' : 'off'}, ` +
        `${capture.scheduler.facesPerFrame} face(s)/frame, ` +
        `${capture.scheduler.facesPending} pending, ` +
        `next face ${capture.scheduler.nextFaceIndex}\n` +
        `IBL prefilter: ${prefilter.enabled ? 'on' : 'off'}, ` +
        `${prefilter.schedule.stepsPerFrame} step(s)/frame, ` +
        `${prefilter.schedule.isRunning ? 'running' : 'idle'}, ` +
        `next step ${prefilter.schedule.nextStep}`
    );
  };

  (window as any).setRainWetness = (override = {}) => {
    const wetness = renderer.sky.skyRenderer.rainWetness;
    wetness.settings = { ...wetness.settings, ...override };
    console.log(
      'setRainWetness — rain wetness is now',
      wetness.settings,
      '\nKeys: soakIn and soakOut, seconds by e for the ground to soak up rain and to dry; filmIn and filmOut, the same for the glossy film on top; fullAt, the rain strength at which the world is fully wet (0.4); strength, scale on both (0 dry).'
    );
  };

  (window as any).setMoon = (
    override: Partial<
      Pick<
        Moon,
        | 'phase'
        | 'size'
        | 'baseIntensity'
        | 'nightRadiance'
        | 'dayRadiance'
        | 'daysPerCycle'
      >
    > = {}
  ) => {
    const moon = renderer.sky.skyRenderer.moon;
    Object.assign(moon, override);
    console.log(
      'setMoon — the moon is now',
      {
        phase: moon.phase,
        size: moon.size,
        baseIntensity: moon.baseIntensity,
        nightRadiance: moon.nightRadiance,
        dayRadiance: moon.dayRadiance,
        daysPerCycle: moon.daysPerCycle,
      },
      '\nKeys: phase, 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter; size, angular radius in degrees; baseIntensity, the light of a full moon; nightRadiance and dayRadiance, the brightness of the disc in a dark and a daylit sky; daysPerCycle, day/night cycles from one new moon to the next.'
    );
  };

  (window as any).holdRainWetness = (value: number | null = 1) => {
    renderer.sky.skyRenderer.rainWetness.override = value;
    console.log(
      value === null
        ? 'holdRainWetness(null) — wetness follows the weather again.'
        : `holdRainWetness(${value}) — every surface held at ${value} wet, whatever the weather. holdRainWetness(null) to let go.`
    );
  };
}
