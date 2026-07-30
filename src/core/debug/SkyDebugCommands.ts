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
}
