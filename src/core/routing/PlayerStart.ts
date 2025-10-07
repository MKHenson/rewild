import { Transform } from 'rewild-renderer';
import { Asset3D } from './Asset3D';
import { StateMachine } from 'rewild-routing';
import { StateMachineData } from './Types';

export class PlayerStart extends Asset3D {
  constructor() {
    super(new Transform());
  }

  mount(): void {
    super.mount();
    (
      this.stateMachine as StateMachine<StateMachineData>
    ).data?.player.cameraController.camera.transform.position.copy(
      this.transform.position
    );
  }
}
