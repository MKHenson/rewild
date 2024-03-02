import { Object3D } from '../Object3D';
import { PlayerComponent } from '../components';

export class Player extends Object3D {
  playerComponent: PlayerComponent;

  constructor() {
    super('Player');
    this.playerComponent = new PlayerComponent();
    this.addComponent(this.playerComponent);
  }
}
