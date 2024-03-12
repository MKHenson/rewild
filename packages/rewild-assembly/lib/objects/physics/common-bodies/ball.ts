import { Sphere, BodyOptions, Material, Body } from 'rewild-physics';
import { bouncyMaterial } from '../Materials';

export function createBodyBall(radius: f32, mass: f32): Body {
  const sphereOptions = new BodyOptions()
    .setShape(new Sphere(radius))
    .setMass(mass)
    .setMaterial(bouncyMaterial);

  const sphereBody = new Body(sphereOptions);
  sphereBody.linearDamping = 0.5;
  return sphereBody;
}
