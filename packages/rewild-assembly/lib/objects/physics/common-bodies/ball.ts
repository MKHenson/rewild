import { Sphere, BodyOptions, Material, Body } from "rewild-physics";

export function createBodyBall(radius: f32, mass: f32): Body {
  const sphereOptions = new BodyOptions()
    .setShape(new Sphere(radius))
    .setMass(mass)
    .setMaterial(new Material("sphere", 0.1, 0.7));

  const sphereBody = new Body(sphereOptions);
  sphereBody.linearDamping = 0.05;
  return sphereBody;
}
