import { Vector2 } from "../math/Vector2";

export function toNormalizedCoord(x: f32, y: f32, width: f32, height: f32): Vector2 {
  return new Vector2((x / width) * 2 - 1, (y / height) * -2 + 1);
}
