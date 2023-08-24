import { Sphere, BodyOptions, Material, Body } from "rewild-physics";

const sphereMaterial = new Material("sphere", 0.1, 0.7);

export function createBodyBall(radius: f32, mass: f32): Body {
  const sphereOptions = new BodyOptions()
    .setShape(new Sphere(radius))
    .setMass(mass)
    .setMaterial(sphereMaterial);

  const sphereBody = new Body(sphereOptions);
  sphereBody.linearDamping = 0.05;
  return sphereBody;
}
