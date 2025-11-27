import { Transform } from 'rewild-renderer';
import { Asset3D } from './Asset3D';
import { StateMachine } from 'rewild-routing';
import { StateMachineData } from './Types';
import { PropValueObject, Vector3 } from 'models';
import { Player } from './Player';

export class PlayerStart extends Asset3D {
  constructor() {
    super(new Transform());
  }

  mount(): void {
    super.mount();
    const camPosProp = this.data.properties?.find(
      (p) => p.type === 'camera-transform'
    );

    const sm = this.stateMachine as StateMachine<StateMachineData>;
    const player = sm.getNode('Player') as Player;
    const lookAtPos = ((camPosProp?.value as PropValueObject)
      .target as Vector3) || [0, 0, 0];
    const startPos = ((camPosProp?.value as PropValueObject)
      .position as Vector3) || [0, 0, -10];
    const upPos = ((camPosProp?.value as PropValueObject).up as Vector3) || [
      0, 1, 0,
    ];

    // Ensure player physics objects exist before attempting to move them
    if (player?.capsuleBody) {
      player.grounded = false;
      player.verticalVelocity = 0.0;

      // Compute capsule body center so that the camera (center + 1.8) matches desired start Y.
      let bodyY = startPos[1] - 1.8;

      // Keep the capsule bottom (center - 0.95) above ground (>= 0). Minimum center.y is 0.95.
      if (bodyY < 0.95) bodyY = 0.95;

      player.capsuleBody.setTranslation(
        {
          x: startPos[0],
          y: bodyY,
          z: startPos[2],
        },
        true
      );

      const pos = player.capsuleBody.translation();
      console.log(pos.x);
    }

    sm.data?.renderer.perspectiveCam.camera.transform.position.fromArray(
      startPos
    );
    sm.data?.renderer.perspectiveCam.camera.transform.up.fromArray(upPos);
    sm.data?.renderer.camController.lookAt(
      lookAtPos[0],
      lookAtPos[1],
      lookAtPos[2]
    );
  }
}
