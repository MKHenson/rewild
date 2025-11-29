import { IBehaviour, IAsset } from 'rewild-routing';
import { Asset3D } from '../Asset3D';
import { RigidBody } from '@dimforge/rapier3d-compat/dynamics';
import { Quaternion } from 'rewild-common';
import {
  Vector3 as RapierVec3,
  Quaternion as RapierQuat,
} from '@dimforge/rapier3d-compat';

export class RigidBodyBehaviour implements IBehaviour {
  name: string;
  rb: RigidBody;
  quat: Quaternion;

  constructor(rb: RigidBody) {
    this.name = 'rigid-body';
    this.rb = rb;
    this.quat = new Quaternion();
  }

  onUpdate(delta: f32, total: u32, asset: IAsset): void {
    if (asset instanceof Asset3D && asset.transform) {
      const position = this.rb.translation();
      const rotation = this.rb.rotation();
      this.quat.set(rotation.x, rotation.y, rotation.z, rotation.w);

      asset.transform.position.set(position.x, position.y, position.z);
      asset.transform.rotation.setFromQuaternion(this.quat);
    }
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
