import { DirectionalLight } from "../../../lights/DirectionalLight";
import { Color } from "../../../math/Color";
import { Container } from "../core/Container";
import { ASInputManager } from "../../../exports/ASInputManager";
import { Listener } from "../../../core/EventDispatcher";
import { Event } from "../../../core/Event";
import { degToRad } from "../../../math/MathUtils";

export class MainMenu extends Container implements Listener {
  constructor() {
    super();
  }

  onEvent(event: Event): void {
    const mouseEvent = event.attachment as ASInputManager.MouseEvent;
    mouseEvent;
  }

  onUpdate(delta: f32, total: u32, fps: u32): void {
    this.meshes[0].rotation.y += delta * 0.1;
  }

  mount(): void {
    super.mount();

    const direction = new DirectionalLight(new Color(1, 1, 1), 6);
    direction.position.set(10, 10, 0);
    direction.target.position.set(0, 0, 0);
    this.runtime!.scene.add(direction);

    this.runtime!.camera.position.set(0, 5, 10);
    this.runtime!.camera.lookAt(0, 0, 0);

    this.meshes[0].position.set(0, -40, -50);
    this.meshes[0].scale.set(30, 30, 30);
    this.meshes[0].rotation.x = degToRad(180);
  }

  unMount(): void {
    super.unMount();
  }
}

export function createMainMenu(): MainMenu {
  return new MainMenu();
}
