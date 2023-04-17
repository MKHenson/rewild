import { EngineVector2 } from "../math/Vector2";

export function toNormalizedCoord(x: f32, y: f32, width: f32, height: f32): EngineVector2 {
  return new EngineVector2((x / width) * 2 - 1, (y / height) * -2 + 1);
}
