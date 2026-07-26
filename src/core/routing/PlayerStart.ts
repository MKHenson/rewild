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
    // The property is absent on a start point that was never positioned in the
    // editor, so every field falls back rather than reading through undefined.
    const camPos = camPosProp?.value as PropValueObject | undefined;
    const lookAtPos = (camPos?.target as Vector3) || [0, 0, 0];
    const startPos = (camPos?.position as Vector3) || [0, 0, -10];
    const upPos = (camPos?.up as Vector3) || [0, 1, 0];

    // Ensure player physics objects exist before attempting to move them
    if (player?.capsuleBody) {
      // Claim the spawn so the Player's terrain-surface fallback (used by
      // levels that have no PlayerStart) leaves this position alone.
      player.spawnResolved = true;
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
    }

    sm.data?.renderer.camera.camera.transform.position.fromArray(startPos);
    sm.data?.renderer.camera.camera.transform.up.fromArray(upPos);
    sm.data?.renderer.camera.camera.lookAt(
      lookAtPos[0],
      lookAtPos[1],
      lookAtPos[2]
    );
    player?.syncLookFromCamera();
  }
}
