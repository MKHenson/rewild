import { Quaternion, Vector3 } from 'rewild-common';
import { ICreatureAnimation } from 'models';
import { Renderer, SkinnedInstance, Transform } from 'rewild-renderer';
import { AnimationController } from '../animation/AnimationController';
import { SPEED_SMOOTHING } from '../routing/behaviours/Animator';

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
  let animated: {
    controllers: AnimationController[];
    frame: number;
    /** Eased toward with the in-game smoothing, as a moving creature's is. */
    targetSpeed: number;
  } | null = null;

  const stopAnimating = () => {
    if (animated) cancelAnimationFrame(animated.frame);
    animated = null;
  };

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

    stopAnimating();
    for (const instance of shown.instances) {
      const starting = instance.clipTime(clip) < 0;
      instance.play(clip, fade);
      if (starting) instance.setClipTime(clip, Math.random() * found.duration);
    }
  };

  (window as any).stopSkinnedClips = (fade = 0.3) => {
    stopAnimating();
    if (!shown) return;
    for (const instance of shown.instances) instance.stopAll(fade);
  };

  (window as any).animateSkinned = (
    speed?: number,
    config: ICreatureAnimation = {}
  ) => {
    if (speed === undefined) {
      console.log(
        `animateSkinned(speed, config = {}) — gives every shown instance an ` +
          `animation controller at a ground speed in m/s. config takes a ` +
          `template's clips, locomotion, clipSpeeds and idleActions. Call ` +
          `again to change the speed. It eases in as a moving creature's does.
` +
          `skinnedLocomotion(set) crossfades to a locomotion set.
` +
          `skinnedAction(meaning, loop = false) plays an action over ` +
          `locomotion; skinnedAction(meaning, false, true) stops it.`
      );
      return;
    }
    if (!shown) {
      console.log(
        'No skinned instances are up. Run showSkinnedInstances first.'
      );
      return;
    }

    if (!animated) {
      for (const instance of shown.instances) instance.stopAll();
      const controllers = shown.instances.map((instance) => {
        const controller = new AnimationController(instance, config);
        controller.start();
        return controller;
      });
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        const dt = (now - last) / 1000;
        last = now;
        const t = 1 - Math.exp(-dt / SPEED_SMOOTHING);
        for (const controller of animated!.controllers) {
          controller.speed += (animated!.targetSpeed - controller.speed) * t;
          controller.update(dt);
        }
        animated!.frame = requestAnimationFrame(tick);
      };
      animated = {
        controllers,
        frame: requestAnimationFrame(tick),
        targetSpeed: speed,
      };
    }

    animated.targetSpeed = speed;
  };

  (window as any).skinnedLocomotion = (set: string, fade = 0.25) => {
    for (const controller of animated?.controllers ?? [])
      controller.setLocomotion(set, fade);
  };

  (window as any).skinnedAction = (
    meaning: string,
    loop = false,
    stop = false
  ) => {
    for (const controller of animated?.controllers ?? []) {
      if (stop) controller.stop(meaning);
      else if (!controller.play(meaning, loop))
        return console.warn(`skinnedAction: no clip for '${meaning}'.`);
    }
  };

  (window as any).hideSkinnedInstances = () => {
    stopAnimating();
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
