import { DirectionalLight } from "../../../lights/DirectionalLight";
import { Color } from "../../../math/Color";
import { Container } from "../core/Container";
import { inputManager } from "../../../exports/io/InputManager";
import { KeyboardEvent } from "../../../exports/io/KeyboardEvent";
import { Listener } from "../../../core/EventDispatcher";
import { Event } from "../../../core/Event";
import { degToRad } from "../../../math/MathUtils";
import { Link } from "../core/Link";
import { print } from "../../../Imports";

export class MainMenu extends Container implements Listener {
  constructor() {
    super("MainMenu");
  }

  init(): void {
    super.init();
    const link = new Link();
    const level1 = this.runtime!.getNode("Level1");

    if (!level1) print(`dont have level`);
    link.connect(this.getPortal("Exit")!, level1!.getPortal("Enter")!);
  }

  onEvent(event: Event): void {
    const keyEvent = event.attachment as KeyboardEvent;
    if (keyEvent.code == "Enter") this.exit(this.getPortal("Exit")!, true);
  }

  onUpdate(delta: f32, total: u32, fps: u32): void {
    this.objects[0].rotation.y += delta * 0.1;
  }

  mount(): void {
    super.mount();

    const direction = new DirectionalLight(new Color(1, 1, 1), 6);
    direction.position.set(10, 10, 0);
    direction.target.position.set(0, 0, 0);
    this.runtime!.scene.add(direction);
    this.addAsset(direction);

    this.runtime!.camera.position.set(0, 5, 10);
    this.runtime!.camera.lookAt(0, 0, 0);

    this.objects[0].position.set(0, -40, -50);
    this.objects[0].scale.set(30, 30, 30);
    this.objects[0].rotation.x = degToRad(180);

    inputManager.addEventListener("keyup", this);
  }

  unMount(): void {
    super.unMount();
    inputManager.removeEventListener("keyup", this);
  }
}

export function createMainMenu(): MainMenu {
  return new MainMenu();
}
