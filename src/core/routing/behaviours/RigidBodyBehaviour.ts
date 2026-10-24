import { BehaviourState, IBehaviour, IAsset } from 'rewild-routing';
import { Asset3D } from '../Asset3D';
import { RigidBody } from '@dimforge/rapier3d-compat/dynamics';
import { Quaternion } from 'rewild-common';
import {
  Vector3 as RapierVec3,
  Quaternion as RapierQuat,
} from '@dimforge/rapier3d-compat';
import { SceneBVH } from 'rewild-renderer/lib/acceleration/SceneBVH';

export class RigidBodyBehaviour implements IBehaviour {
  name: string;
  rb: RigidBody;
  quat: Quaternion;
  isFixed: boolean;
  sceneBVH: SceneBVH | null;

  constructor(rb: RigidBody, sceneBVH: SceneBVH | null = null) {
    this.name = 'rigid-body';
    this.rb = rb;
    this.quat = new Quaternion();
    this.isFixed = rb.isFixed();
    this.sceneBVH = sceneBVH;
  }

  onUpdate(delta: f32, total: u32, asset: IAsset): void {
    if (!this.isFixed && !this.rb.isSleeping() && asset instanceof Asset3D && asset.transform) {
      const position = this.rb.translation();
      const rotation = this.rb.rotation();
      this.quat.set(rotation.x, rotation.y, rotation.z, rotation.w);

      asset.transform.position.set(position.x, position.y, position.z);
      asset.transform.rotation.setFromQuaternion(this.quat);
      this.sceneBVH?.markObjectMoved(asset.transform);
    }
  }

  // Pushes an externally changed transform back into the body. Only meaningful
  // for a fixed body — a dynamic one owns its own transform once it is running,
  // and moving it under the solver would fight it.
  applyTransform(asset: IAsset): void {
    if (!this.isFixed || !(asset instanceof Asset3D)) return;

    const rotation = asset.transform.quaternion;
    this.rb.setRotation(
      new RapierQuat(rotation.x, rotation.y, rotation.z, rotation.w),
      false
    );
    const position = asset.transform.position;
    this.rb.setTranslation(
      new RapierVec3(position.x, position.y, position.z),
      true
    );
  }

  serialize(): BehaviourState {
    const t = this.rb.translation();
    const r = this.rb.rotation();
    const v = this.rb.linvel();
    const w = this.rb.angvel();
    return {
      translation: [t.x, t.y, t.z],
      rotation: [r.x, r.y, r.z, r.w],
      linearVelocity: [v.x, v.y, v.z],
      angularVelocity: [w.x, w.y, w.z],
    };
  }

  restore(state: BehaviourState): void {
    const t = vector(state.translation, 3);
    const r = vector(state.rotation, 4);
    const v = vector(state.linearVelocity, 3);
    const w = vector(state.angularVelocity, 3);
    if (t) this.rb.setTranslation(new RapierVec3(t[0], t[1], t[2]), true);
    if (r) this.rb.setRotation(new RapierQuat(r[0], r[1], r[2], r[3]), true);
    if (this.isFixed) return;
    if (v) this.rb.setLinvel(new RapierVec3(v[0], v[1], v[2]), true);
    if (w) this.rb.setAngvel(new RapierVec3(w[0], w[1], w[2]), true);
  }

  onMount(asset: IAsset): void {
    if (asset instanceof Asset3D) {
      this.rb.setRotation(
        new RapierQuat(
          asset.initialRotation.x,
          asset.initialRotation.y,
          asset.initialRotation.z,
          asset.initialRotation.w
        ),
        false
      );
      this.rb.setTranslation(
        new RapierVec3(
          asset.initialPosition.x,
          asset.initialPosition.y,
          asset.initialPosition.z
        ),
        true
      );
    }
  }
}

function vector(
  value: BehaviourState[string],
  length: number
): number[] | null {
  return Array.isArray(value) &&
    value.length === length &&
    value.every((n) => typeof n === 'number')
    ? (value as number[])
    : null;
}
