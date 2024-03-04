import { Vec3, BodyOptions, Body, Plane } from 'rewild-physics';
import { groundMaterial } from '../Materials';
import { degToRad } from 'rewild-common';

export function createBodyPlane(
  angleX: f32,
  angleY: f32,
  angleZ: f32,
  amount: f32
): Body {
  const boxOptions = new BodyOptions()
    .setMass(0)
    .setShape(new Plane())
    .setMaterial(groundMaterial);

  const body = new Body(boxOptions);
  body.quaternion.setFromAxisAngle(new Vec3(angleX, angleY, angleZ), amount);
  return body;
}
