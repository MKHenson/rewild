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

  // Sky-driven IBL (Lichen phase 4). Only the captured cube exists so far —
  // #200 adds the irradiance and prefiltered-specular rows to the same viewer.
  (window as any).showIblCubes = () => {
    renderer.sky.skyRenderer.cubeDebugRenderer.enabled = true;
    console.log(
      'IBL cube viewer ON — captured sky faces along the bottom, ' +
        'left to right: +X -X +Y -Y +Z -Z. Exposed and tonemapped exactly as ' +
        'the frame is, so a tile should read like the sky above it. ' +
        'Use setIblCubeExposureBias() to open up a night capture.'
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

  (window as any).skyCaptureStats = () => {
    const capture = renderer.sky.skyRenderer.cubeCapture;
    console.log(
      `Sky capture: ${capture.enabled ? 'on' : 'off'}, ` +
        `${capture.scheduler.facesPerFrame} face(s)/frame, ` +
        `${capture.scheduler.facesPending} pending, ` +
        `next face ${capture.scheduler.nextFaceIndex}`
    );
  };
}
