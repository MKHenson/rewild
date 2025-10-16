import { Transform } from 'rewild-renderer';
import { Asset3D } from './Asset3D';
import { StateMachine } from 'rewild-routing';
import { StateMachineData } from './Types';
import { PropValueObject, Vector3 } from 'models';

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

    sm.data?.renderer.camController.target.fromArray(
      ((camPosProp?.value as PropValueObject).target as Vector3) || [0, 0, 0]
    );
    sm.data?.renderer.perspectiveCam.camera.transform.position.fromArray(
      ((camPosProp?.value as PropValueObject).position as Vector3) || [
        0, 0, -10,
      ]
    );
  }
}
