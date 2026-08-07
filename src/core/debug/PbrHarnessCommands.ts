import { Vector3 } from 'rewild-common';
import { Mesh, Renderer, StandardPass, Transform } from 'rewild-renderer';

// The PBR reference harness (#203).
//
// Energy-conservation and Fresnel errors are the kind that get "fixed" by
// compensating somewhere else and then resurface under different lighting. The
// point of this file is to turn questions that are otherwise a matter of
// opinion — is that highlight too strong, is that roughness map even loaded —
// into something you can look at directly.

/**
 * Channel names in the order DEBUG_CHANNEL_* declares them in
 * shader-lib/material-debug.wgsl. Index into this array *is* the shader
 * constant, so the two stay in step by construction.
 */
const DEBUG_CHANNELS = [
  'off',
  'basecolor',
  'metallic',
  'roughness',
  'normal',
  'ao',
  'emissive',
  'direct',
  'indirect',
] as const;

type DebugChannel = typeof DEBUG_CHANNELS[number];

/** Roughness steps across the grid, left to right. */
const ROUGHNESS_STEPS = 7;
/** Metallic rows, bottom to top: dielectric, half, metal. */
const METALLIC_ROWS = [0, 0.5, 1];

/** Sphere spacing and the grid's distance in front of the camera, in metres. */
const SPHERE_SPACING = 2.5;
const GRID_DISTANCE = 14;

export function registerPbrHarnessCommands(renderer: Renderer) {
  // Held so hidePbrReferenceGrid can take them out again. The passes go with
  // them: each sphere needs its own metallic/roughness pair, and those live in
  // the material's uniform block rather than per mesh.
  let gridRoot: Transform | null = null;
  let gridPasses: StandardPass[] = [];

  (window as any).setMaterialChannel = (channel?: DebugChannel) => {
    if (channel === undefined) {
      console.log(
        `setMaterialChannel(channel) — renders one PBR input scene-wide ` +
          `instead of shading it.\n` +
          `channels: ${DEBUG_CHANNELS.join(', ')}\n` +
          `Covers the standard material, its instanced variant and terrain, so ` +
          `the same channel can be compared across all three.\n` +
          `'direct' and 'indirect' split the shaded output by light source ` +
          `rather than showing an input — the fastest way to tell a sun ` +
          `problem from a sky one.\n` +
          `Currently: ${DEBUG_CHANNELS[renderer.materialDebugChannel]}`
      );
      return;
    }

    const index = DEBUG_CHANNELS.indexOf(channel);
    if (index < 0) {
      console.warn(
        `Unknown channel "${channel}". One of: ${DEBUG_CHANNELS.join(', ')}`
      );
      return;
    }

    renderer.materialDebugChannel = index;
    console.log(
      index === 0
        ? 'Material debug off — shading normally.'
        : `Showing '${channel}' scene-wide. setMaterialChannel('off') to restore.`
    );
  };

  (window as any).showPbrReferenceGrid = () => {
    if (gridRoot) {
      console.log('Reference grid is already up.');
      return;
    }

    let geometry;
    try {
      geometry = renderer.geometryManager.get('sphere');
    } catch {
      console.warn('No "sphere" geometry registered.');
      return;
    }

    const camera = renderer.camera.camera;
    gridRoot = new Transform();
    gridPasses = [];

    // Parked in front of wherever the camera is *now*, in world space, rather
    // than parented to it. A grid that follows the view cannot be walked around,
    // and walking around it is how the specular lobe is judged.
    const m = camera.transform.matrixWorld.elements;
    const forward = new Vector3(-m[8], -m[9], -m[10]).normalize();
    const right = new Vector3(m[0], m[1], m[2]).normalize();
    const up = new Vector3(m[4], m[5], m[6]).normalize();
    const origin = camera.transform.position;

    for (let row = 0; row < METALLIC_ROWS.length; row++) {
      for (let col = 0; col < ROUGHNESS_STEPS; col++) {
        const pass = new StandardPass();
        pass.material.metallic = METALLIC_ROWS[row];
        // Spread over the full range endpoints included, so both the mirror and
        // the fully-rough end are actually present rather than approached.
        pass.material.roughness = col / (ROUGHNESS_STEPS - 1);
        // Mid-grey rather than white: a white sphere clips before its shading
        // does, which hides exactly the energy errors this is here to show.
        pass.material.baseColorFactor = [0.5, 0.5, 0.5, 1];
        gridPasses.push(pass);

        const mesh = new Mesh(geometry, pass);
        const offsetX = (col - (ROUGHNESS_STEPS - 1) / 2) * SPHERE_SPACING;
        const offsetY = (row - (METALLIC_ROWS.length - 1) / 2) * SPHERE_SPACING;

        mesh.transform.position.set(
          origin.x +
            forward.x * GRID_DISTANCE +
            right.x * offsetX +
            up.x * offsetY,
          origin.y +
            forward.y * GRID_DISTANCE +
            right.y * offsetX +
            up.y * offsetY,
          origin.z +
            forward.z * GRID_DISTANCE +
            right.z * offsetX +
            up.z * offsetY
        );

        gridRoot.addChild(mesh.transform);
      }
    }

    renderer.scene.addChild(gridRoot);
    console.log(
      `PBR reference grid up — ${ROUGHNESS_STEPS} roughness steps left to ` +
        `right (0 to 1), metallic ${METALLIC_ROWS.join(
          ' / '
        )} bottom to top.\n` +
        `What to look for: the highlight should tighten and brighten toward the ` +
        `left without the sphere gaining total energy, the metal row should take ` +
        `its colour from its reflection rather than its albedo, and every sphere ` +
        `should keep a visible rim from IBL rather than going black at the edge.`
    );
  };

  (window as any).hidePbrReferenceGrid = () => {
    if (!gridRoot) {
      console.log('Reference grid is not up.');
      return;
    }
    gridRoot.removeFromParent();
    for (const pass of gridPasses) pass.dispose();
    gridPasses = [];
    gridRoot = null;
    console.log('PBR reference grid hidden.');
  };
}
