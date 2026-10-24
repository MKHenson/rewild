import { Quaternion, Vector3 } from 'rewild-common';
import { Renderer, SkinnedInstance, Transform } from 'rewild-renderer';

const SPACING = 2;
const DISTANCE = 8;
/** Below this drop the grid stands on the terrain; further, it floats in view. */
const MAX_GROUND_DROP = 5;

// Skinned instancing check: a grid of SkinnedInstances of one model in their
// bind pose, drawn in one call per primitive.
export function registerSkinnedDebugCommands(renderer: Renderer) {
  let shown: {
    modelId: string;
    root: Transform;
    instances: SkinnedInstance[];
  } | null = null;

  (window as any).showSkinnedInstances = (modelId?: string, count = 20) => {
    if (modelId === undefined) {
      console.log(
        `showSkinnedInstances(modelId, count = 20) — places a grid of a ` +
          `skinned model's instances in their bind pose ${DISTANCE}m along ` +
          `the view, on the terrain when it is within ${MAX_GROUND_DROP}m ` +
          `below. One draw per primitive covers every visible one.\n` +
          `hideSkinnedInstances() takes them away again.`
      );
      return;
    }

    (window as any).hideSkinnedInstances();

    const camera = renderer.camera.camera;
    const m = camera.transform.matrixWorld.elements;
    const view = new Vector3(-m[8], -m[9], -m[10]).normalize();
    const forward = new Vector3(view.x, 0, view.z).normalize();
    const right = new Vector3(-forward.z, 0, forward.x);
    const facing = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.atan2(-forward.x, -forward.z)
    );
    const origin = new Vector3(m[12], m[13], m[14]);
    const height = origin.y + view.y * DISTANCE;
    const columns = Math.ceil(Math.sqrt(count));

    const root = new Transform();
    const instances: SkinnedInstance[] = [];

    for (let i = 0; i < count; i++) {
      const col = (i % columns) - (columns - 1) / 2;
      const row = Math.floor(i / columns);
      const x =
        origin.x +
        forward.x * (DISTANCE + row * SPACING) +
        right.x * col * SPACING;
      const z =
        origin.z +
        forward.z * (DISTANCE + row * SPACING) +
        right.z * col * SPACING;
      const ground = renderer.terrainRenderer.sampleHeight(x, z);
      const y =
        ground !== null && height - ground < MAX_GROUND_DROP ? ground : height;

      let instance: SkinnedInstance;
      try {
        instance = new SkinnedInstance(renderer, modelId);
      } catch (error) {
        console.warn(`showSkinnedInstances: ${(error as Error).message}`);
        for (const created of instances) created.dispose();
        return;
      }

      instance.transform.position.set(x, y, z);
      instance.transform.quaternion.copy(facing);
      root.addChild(instance.transform);
      instances.push(instance);
    }

    renderer.scene.addChild(root);
    shown = { modelId, root, instances };
    console.log(
      `${count} instances of '${modelId}' up, ` +
        `${instances[0].meshes.length} draw(s) for every visible one. ` +
        `Each should stand in its bind pose and cast a shadow.`
    );
  };

  (window as any).playSkinnedClip = (clip?: string, fade = 0.3) => {
    const model = shown && renderer.skinnedModels.get(shown.modelId);
    if (!shown || !model) {
      console.log(
        'No skinned instances are up. Run showSkinnedInstances first.'
      );
      return;
    }

    const names = model.player.clips.map((c) => c.name);
    if (clip === undefined) {
      console.log(
        `playSkinnedClip(clip, fade = 0.3) — crossfades every shown instance ` +
          `to a clip over fade seconds. An instance that starts the clip ` +
          `starts at its own random time.\n` +
          `stopSkinnedClips(fade = 0.3) fades them back to the bind pose.\n` +
          `Clips: ${names.join(', ') || 'none'}`
      );
      return;
    }

    const found = model.player.clips.find((c) => c.name === clip);
    if (!found) {
      console.warn(
        `playSkinnedClip: no clip '${clip}'. Clips: ${names.join(', ')}`
      );
      return;
    }

    for (const instance of shown.instances) {
      const starting = instance.clipTime(clip) < 0;
      instance.play(clip, fade);
      if (starting) instance.setClipTime(clip, Math.random() * found.duration);
    }
  };

  (window as any).stopSkinnedClips = (fade = 0.3) => {
    if (!shown) return;
    for (const instance of shown.instances) instance.stopAll(fade);
  };

  (window as any).hideSkinnedInstances = () => {
    if (!shown) return;
    for (const instance of shown.instances) instance.dispose();
    shown.root.removeFromParent();
    shown = null;
  };

  (window as any).skinnedInstancesInfo = () => {
    const model = shown && renderer.skinnedModels.get(shown.modelId);
    if (!shown || !model) {
      console.log(
        'No skinned instances are up. Run showSkinnedInstances first.'
      );
      return;
    }

    const m = renderer.camera.camera.transform.matrixWorld.elements;
    const p = shown.instances[0].transform.matrixWorld.elements;
    const now = performance.now();
    console.log(
      `skinnedInstancesInfo() — ${model.poses.count} poses, ` +
        `${model.poses.jointCount} joints, in scene: ${!!shown.root.parent}\n` +
        `clips: ${
          model.player.clips
            .map((c) => `${c.name} (${c.duration.toFixed(2)}s)`)
            .join(', ') || 'none'
        }\n` +
        `camera (${m[12].toFixed(1)}, ${m[13].toFixed(1)}, ` +
        `${m[14].toFixed(1)}), first instance (${p[12].toFixed(1)}, ` +
        `${p[13].toFixed(1)}, ${p[14].toFixed(1)})`
    );
    console.table(
      model.primitives.map(({ geometry, pass }) => ({
        pipeline: !!pass.pipeline,
        compatible: pass.isGeometryCompatible(geometry),
        alphaMode: pass.alphaMode,
        built: !geometry.requiresBuild,
        jointBuffer: !!geometry.jointBuffer,
        drawnMsAgo: pass.lastDrawn ? Math.round(now - pass.lastDrawn) : 'never',
        drawnCount: pass.lastDrawnCount,
      }))
    );
  };
}
