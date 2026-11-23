import { Matrix4 } from 'rewild-common';
import { UIWorldSize } from '../lib';

/** The vertical field of view of a world example's camera. */
const FOV_Y = (40 * Math.PI) / 180;
/** The part of the view's height that a world surface fills when it faces the camera. */
const FILL = 0.7;
const NEAR = 0.05;
const FAR = 100;

const view = new Matrix4();

/**
 * Writes into `out` the view projection of a camera on the +z axis that looks
 * at the origin, at the distance where a surface of `size` fills most of the
 * view. The projection is the game camera's.
 */
export function exampleCamera(
  out: Matrix4,
  size: UIWorldSize,
  aspect: number
): Matrix4 {
  const top = NEAR * Math.tan(FOV_Y / 2);
  const fit = Math.max(size.height, size.width / aspect);
  const distance = fit / 2 / Math.tan(FOV_Y / 2) / FILL;
  out.makePerspective(-top * aspect, top * aspect, top, -top, NEAR, FAR);
  return out.multiply(view.makeTranslation(0, 0, -distance));
}
