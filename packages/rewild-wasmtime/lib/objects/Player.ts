import { Object3D } from '../Object3D';
import { PlayerComponent } from '../components';
import { Camera } from './Camera';

export class Player extends Object3D {
  playerComponent: PlayerComponent;
  camera: Camera;

  constructor() {
    super('Player');
    this.playerComponent = new PlayerComponent();
    this.addComponent(this.playerComponent);

    this.camera = new Camera();
  }

  setPosition(x: number, y: number, z: number): void {
    this.camera.setPosition(x, y, z);
  }
}
