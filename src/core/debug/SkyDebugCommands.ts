import { Renderer, RENDER_QUALITIES, RenderQuality } from 'rewild-renderer';

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

  // Sky quality tier. The tiers are WGSL compile-time constants (loop bounds and
  // kernel radii, which cannot come from a uniform), so setting this schedules a
  // shader rebuild rather than taking effect immediately — expect one hitched
  // frame. Pair it with startSkyPerfCapture to measure the difference.
  (window as any).setSkyQuality = (quality?: string) => {
    const sky = renderer.sky.skyRenderer;

    if (quality === undefined) {
      console.log(
        `Sky quality: ${sky.quality} — call setSkyQuality('${RENDER_QUALITIES.join(
          "' | '"
        )}')`
      );
      return;
    }

    // Compare as plain strings: the argument comes from a console, so it has not
    // been through any type checking and must not be asserted into the union
    // before it is validated.
    if (!(RENDER_QUALITIES as readonly string[]).includes(quality)) {
      console.warn(
        `Unknown sky quality "${quality}". Expected one of: ${RENDER_QUALITIES.join(
          ', '
        )}`
      );
      return;
    }

    sky.quality = quality as RenderQuality;
    console.log(`Sky quality → ${quality}; shaders rebuild on the next frame.`);
  };

  // Bloom tuning. Both of these are uniforms, so unlike setSkyQuality they take
  // effect on the very next frame with no rebuild — which is what makes them
  // usable for eyeballing a value.
  //
  // threshold is in exposure-adjusted luminance: multiply by 1000 for the raw
  // HDR luminance at which a pixel starts to glow. skyBlend caps the sky at 60
  // HDR, so anything at or below 0.06 makes the whole sky a bloom source.
  (window as any).setBloom = (amount?: number, threshold?: number) => {
    const bloom = renderer.sky.skyRenderer.bloomPass;

    if (amount === undefined && threshold === undefined) {
      console.log(
        `Bloom: amount=${bloom.bloomAmount}, threshold=${bloom.bloomThreshold} ` +
          `(glows above ~${Math.round(bloom.bloomThreshold * 1000)} HDR luminance) — ` +
          `call setBloom(amount, threshold)`
      );
      return;
    }

    if (amount !== undefined) {
      if (!Number.isFinite(amount) || amount < 0) {
        console.warn(`Bloom amount must be a number >= 0, got ${amount}`);
        return;
      }
      bloom.bloomAmount = amount;
    }

    if (threshold !== undefined) {
      if (!Number.isFinite(threshold) || threshold <= 0) {
        console.warn(`Bloom threshold must be a number > 0, got ${threshold}`);
        return;
      }
      bloom.bloomThreshold = threshold;
    }

    console.log(
      `Bloom → amount=${bloom.bloomAmount}, threshold=${bloom.bloomThreshold} ` +
        `(glows above ~${Math.round(bloom.bloomThreshold * 1000)} HDR luminance)`
    );
  };

  (window as any).toggleCloudShadowDebug = () => {
    const config = renderer.sky.skyRenderer.cloudShadowRenderer.config;
    console.log(
      `Cloud Shadow Map: ${config.resolution}x${config.resolution}, ` +
        `worldSize=${config.worldSize}m, updateFreq=every ${config.updateFrequency} frames`
    );
  };
}
