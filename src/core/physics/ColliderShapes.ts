import type { ColliderDesc } from '@dimforge/rapier3d-compat';
import {
  PhysicsShape,
  SCATTER_INSTANCE_STRIDE,
  ScatterInstances,
} from 'rewild-renderer';

type Rapier = typeof import('@dimforge/rapier3d-compat');

// One scaled copy per hull shape, reused across every instance that shares
// it: Rapier copies the points on registration, so nothing holds the buffer.
const _hullPoints = new WeakMap<PhysicsShape, Float32Array>();

function hullPoints(shape: PhysicsShape & { type: 'hull' }, scale: number): Float32Array {
  let scaled = _hullPoints.get(shape);
  if (!scaled) {
    scaled = new Float32Array(shape.points.length);
    _hullPoints.set(shape, scaled);
  }
  for (let i = 0; i < scaled.length; i++) scaled[i] = shape.points[i] * scale;
  return scaled;
}

// Shapes are authored as full extents; Rapier takes half-extents and a
// capsule's half-height. The halving happens here and nowhere else.
function shapeDesc(
  R: Rapier,
  shape: PhysicsShape,
  scale: number
): ColliderDesc {
  switch (shape.type) {
    case 'box':
      return R.ColliderDesc.cuboid(
        (shape.size[0] * scale) / 2,
        (shape.size[1] * scale) / 2,
        (shape.size[2] * scale) / 2
      );
    case 'sphere':
      return R.ColliderDesc.ball(shape.radius * scale);
    case 'capsule':
      return R.ColliderDesc.capsule(
        (shape.height * scale) / 2,
        shape.radius * scale
      );
    case 'hull': {
      const desc = R.ColliderDesc.convexHull(hullPoints(shape, scale));
      if (!desc) throw new Error('Hull collider points are degenerate.');
      return desc;
    }
  }
}

/**
 * A collider for an authored shape, placed relative to the body it attaches
 * to. `scale` is the instance's uniform scale: it grows the dimensions and
 * the offset together, so a scaled-up tree's trunk stays where its trunk is.
 */
export function createColliderDesc(
  R: Rapier,
  shape: PhysicsShape,
  scale = 1
): ColliderDesc {
  const desc = shapeDesc(R, shape, scale);
  if (shape.offset)
    desc.setTranslation(
      shape.offset[0] * scale,
      shape.offset[1] * scale,
      shape.offset[2] * scale
    );
  return desc;
}

// setRotation copies out of its argument, so one scratch serves every call.
const _rotation = { x: 0, y: 0, z: 0, w: 1 };

/**
 * A collider for the scatter instance at `index`, posed in world space with no
 * rigid body: dimensions and offset at the instance's scale, the offset carried
 * by its rotation, at its position plus the chunk's world origin (the space
 * `ScatterInstances.data` is chunk-local to).
 *
 * Body-less because a scattered tree never moves and a forest registers
 * thousands: a lone fixed collider is the cheapest thing Rapier holds, and
 * `World.createCollider(desc)` with no parent puts it exactly where the desc
 * says.
 */
export function createScatterColliderDesc(
  R: Rapier,
  shape: PhysicsShape,
  instances: ScatterInstances,
  index: number,
  originX: number,
  originY: number,
  originZ: number
): ColliderDesc {
  if (index < 0 || index >= instances.count)
    throw new Error(
      `Scatter instance ${index} is out of range for a layer of ${instances.count}.`
    );

  const data = instances.data;
  const base = index * SCATTER_INSTANCE_STRIDE;
  const qx = data[base + 3];
  const qy = data[base + 4];
  const qz = data[base + 5];
  const qw = data[base + 6];
  const scale = data[base + 7];

  let x = originX + data[base];
  let y = originY + data[base + 1];
  let z = originZ + data[base + 2];

  if (shape.offset) {
    const ox = shape.offset[0] * scale;
    const oy = shape.offset[1] * scale;
    const oz = shape.offset[2] * scale;

    // q * (o, 0) * q⁻¹, expanded so nothing is allocated for it.
    const ix = qw * ox + qy * oz - qz * oy;
    const iy = qw * oy + qz * ox - qx * oz;
    const iz = qw * oz + qx * oy - qy * ox;
    const iw = -qx * ox - qy * oy - qz * oz;

    x += ix * qw + iw * -qx + iy * -qz - iz * -qy;
    y += iy * qw + iw * -qy + iz * -qx - ix * -qz;
    z += iz * qw + iw * -qz + ix * -qy - iy * -qx;
  }

  _rotation.x = qx;
  _rotation.y = qy;
  _rotation.z = qz;
  _rotation.w = qw;

  return shapeDesc(R, shape, scale)
    .setTranslation(x, y, z)
    .setRotation(_rotation);
}
