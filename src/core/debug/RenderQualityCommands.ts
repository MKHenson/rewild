import { Renderer, RENDER_QUALITIES, RenderQuality } from 'rewild-renderer';

// Whole-frame image controls: the render quality tier, exposure and bloom. All
// three cut across the sky/scene split, which is why they live here rather than
// alongside the sky commands.
//
// App-wide render quality tier. Sky, clouds, god rays and bloom all follow it,
// and future consumers (materials) will too.
//
// The tiers are WGSL compile-time constants (loop bounds and kernel radii, which
// cannot come from a uniform), so setting this schedules a shader rebuild rather
// than taking effect immediately — expect one hitched frame. Pair it with
// startSkyPerfCapture to measure the difference.
export function registerRenderQualityCommands(renderer: Renderer) {
  (window as any).setRenderQuality = (quality?: string) => {
    if (quality === undefined) {
      console.log(
        `Render quality: ${
          renderer.quality.level
        } — call setRenderQuality('${RENDER_QUALITIES.join("' | '")}')`
      );
      return;
    }

    // Compare as plain strings: the argument comes from a console, so it has not
    // been through any type checking and must not be asserted into the union
    // before it is validated.
    if (!(RENDER_QUALITIES as readonly string[]).includes(quality)) {
      console.warn(
        `Unknown render quality "${quality}". Expected one of: ${RENDER_QUALITIES.join(
          ', '
        )}`
      );
      return;
    }

    renderer.quality.level = quality as RenderQuality;
    console.log(
      `Render quality → ${quality}; affected shaders rebuild on the next frame.`
    );
  };

  // Whole-frame exposure — the linear scale applied to HDR radiance just before
  // the ACES curve. Deliberately not EV stops: the atmosphere's radiance scale
  // was hand-tuned in absolute terms against this multiplier, so the number that
  // is useful to type here is the multiplier itself.
  //
  // Turning this is the quickest check that HDR values are surviving the
  // pipeline: if raising it brightens the sky but leaves geometry black, the
  // scene pass is clipping rather than the tonemap.
  (window as any).setExposure = (exposure?: number) => {
    const camera = renderer.camera.camera;

    if (exposure === undefined) {
      console.log(`Exposure: ${camera.exposure} — call setExposure(scale)`);
      return;
    }

    if (!Number.isFinite(exposure) || exposure <= 0) {
      console.warn(`Exposure must be a number > 0, got ${exposure}`);
      return;
    }

    camera.exposure = exposure;
    console.log(`Exposure → ${camera.exposure}`);
  };

  // Bloom tuning. Both of these are uniforms, so unlike setRenderQuality they
  // take effect on the very next frame with no rebuild — which is what makes them
  // usable for eyeballing a value.
  //
  // threshold is in exposure-adjusted luminance: multiply by 1000 for the raw
  // HDR luminance at which a pixel starts to glow. skyBlend caps the sky at 60
  // HDR, so anything at or below 0.06 makes the whole sky a bloom source.
  (window as any).setBloom = (amount?: number, threshold?: number) => {
    const bloom = renderer.frameCompositor.bloom;

    if (amount === undefined && threshold === undefined) {
      console.log(
        `Bloom: amount=${bloom.bloomAmount}, threshold=${bloom.bloomThreshold} ` +
          `(glows above ~${Math.round(
            bloom.bloomThreshold * 1000
          )} HDR luminance) — ` +
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
        `(glows above ~${Math.round(
          bloom.bloomThreshold * 1000
        )} HDR luminance)`
    );
  };
}
