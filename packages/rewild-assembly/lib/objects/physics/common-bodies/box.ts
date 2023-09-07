import { Box, Vec3, BodyOptions, Material, Body } from "rewild-physics";
import { diffuseMaterial } from "../Materials";

export function createBodyBox(
  width: f32,
  height: f32,
  depth: f32,
  mass: f32
): Body {
  const boxOptions = new BodyOptions()
    .setShape(new Box(new Vec3(width, height, depth)))
    .setMass(mass)
    .setMaterial(diffuseMaterial);

  const boxBody = new Body(boxOptions);
  boxBody.linearDamping = 0.05;
  return boxBody;
}
