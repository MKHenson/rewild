import { Renderer } from 'rewild-renderer';

// Sky console commands (moved out of SkyRenderer.init so all debug commands
// live together): perf capture toggles and the cloud-shadow config dump.
export function registerSkyDebugCommands(renderer: Renderer) {
  (window as any).startSkyPerfCapture = () => {
    renderer.sky.skyRenderer.perfMonitor.enabled = true;
    console.log('Sky performance capture started');
  };
  (window as any).stopSkyPerfCapture = () => {
    renderer.sky.skyRenderer.perfMonitor.enabled = false;
    console.log('Sky performance capture stopped');
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
}
