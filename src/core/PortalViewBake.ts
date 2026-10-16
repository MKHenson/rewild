import { Vector3 } from 'models';
import {
  PORTAL_VIEW_FACES,
  PORTAL_VIEW_FACE_AXES,
  Renderer,
  Transform,
} from 'rewild-renderer';
import { InteractionLayer } from './InteractionLayer';

export const PORTAL_VIEW_FACE_SIZE = 1024;
/** Frames to wait at the bake position for nearby terrain to stream in. */
const SETTLE_FRAMES = 90;
/** Frames per face for temporal effects such as clouds to reconverge. */
const FACE_FRAMES = 12;

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function waitFrames(count: number) {
  for (let i = 0; i < count; i++) await nextFrame();
}

const isHelper = (transform: Transform) =>
  !!transform.userData.isHelper ||
  (transform.layers.mask & (1 << InteractionLayer.Helper)) !== 0;

/**
 * Renders the scene from `position` into a strip of six cube faces, laid out as
 * PORTAL_VIEW_FACES describes, and encodes it as WebP. Each face is the centre
 * square of a 90° frame, mirrored to match cube sampling. Screen-space effects
 * that differ from face to face, god rays and the lens, are off while it runs.
 * The camera, effects and editor helpers are restored afterwards.
 */
export async function bakePortalView(
  renderer: Renderer,
  position: Vector3,
  faceSize = PORTAL_VIEW_FACE_SIZE
): Promise<Blob> {
  const controller = renderer.camera;
  const transform = controller.camera.transform;
  const savedPosition = transform.position.clone();
  const savedUp = transform.up.clone();
  const savedQuaternion = transform.quaternion.clone();
  const savedFov = controller.fov;
  const skyRenderer = renderer.sky.skyRenderer;
  const savedGodRays = skyRenderer.godRayEnabled;
  const savedLensEffects = renderer.lensEffects;

  const hidden: Transform[] = [];
  renderer.scene.traverse((child) => {
    if (child.visible && isHelper(child)) {
      child.visible = false;
      hidden.push(child);
    }
  });

  const strip = new OffscreenCanvas(faceSize * PORTAL_VIEW_FACES, faceSize);
  const context = strip.getContext('2d')!;

  try {
    skyRenderer.godRayEnabled = false;
    renderer.lensEffects = false;
    controller.fov = 90;
    controller.updateProjectionMatrix();
    transform.position.set(position[0], position[1], position[2]);

    for (let face = 0; face < PORTAL_VIEW_FACES; face++) {
      const [fx, fy, fz, ux, uy, uz] = PORTAL_VIEW_FACE_AXES[face];
      transform.up.set(ux, uy, uz);
      controller.camera.lookAt(
        position[0] + fx,
        position[1] + fy,
        position[2] + fz
      );

      await waitFrames(face === 0 ? SETTLE_FRAMES : FACE_FRAMES);
      const frame = await renderer.captureScreenshot();
      if (!frame) throw new Error('Could not capture the portal view');

      const bitmap = await createImageBitmap(frame);
      const side = Math.min(bitmap.width, bitmap.height);
      context.save();
      context.translate((face + 1) * faceSize, 0);
      context.scale(-1, 1);
      context.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        faceSize,
        faceSize
      );
      context.restore();
      bitmap.close();
    }
  } finally {
    skyRenderer.godRayEnabled = savedGodRays;
    renderer.lensEffects = savedLensEffects;
    controller.fov = savedFov;
    controller.updateProjectionMatrix();
    transform.position.copy(savedPosition);
    transform.up.copy(savedUp);
    transform.quaternion.copy(savedQuaternion);
    for (const child of hidden) child.visible = true;
  }

  return strip.convertToBlob({ type: 'image/webp', quality: 0.9 });
}
