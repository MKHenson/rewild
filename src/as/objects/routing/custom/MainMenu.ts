import { DirectionalLight } from "../../../lights/DirectionalLight";
import { Color } from "../../../math/Color";
import { Container } from "../core/Container";
import { uiSignaller } from "../../../extras/ui/uiSignalManager";
import { Listener } from "../../../core/EventDispatcher";
import { Event } from "../../../core/Event";
import { UIEvent } from "../../../extras/ui/UIEvent";
import { degToRad } from "../../../math/MathUtils";
import { Link } from "../core/Link";
import { UIEventType } from "../../../../common/UIEventType";

export class MainMenu extends Container implements Listener {
  private sun!: DirectionalLight;

  constructor() {
    super("MainMenu");
  }

  init(): void {
    super.init();
    const link = new Link();
    const level1 = this.runtime!.getNode("Level1");

    if (!level1) console.log(`dont have level`);
    link.connect(this.getPortal("Exit")!, level1!.getPortal("Enter")!);

    this.sun = new DirectionalLight(new Color(1, 1, 1), 6);
    this.sun.position.set(10, 10, 0);
    this.sun.target.position.set(0, 0, 0);
    this.addAsset(this.sun);
  }

  onEvent(event: Event): void {
    const uiEvent = event.attachment as UIEvent;
    if (uiEvent.eventType == UIEventType.StartGame) this.exit(this.getPortal("Exit")!, true);
  }

  onUpdate(delta: f32, total: u32, fps: u32): void {
    this.objects[0].rotation.y += delta * 0.1;
  }

  mount(): void {
    super.mount();

    this.runtime!.camera.position.set(0, 5, 10);
    this.runtime!.camera.lookAt(0, 0, 0);

    this.objects[0].position.set(0, -40, -50);
    this.objects[0].scale.set(30, 30, 30);
    this.objects[0].rotation.x = degToRad(180);

    const sbybox = this.findObjectByName("skybox")!;
    sbybox.scale.set(200, 200, 200);
    sbybox.position.set(0, 0, 0);

    uiSignaller.addEventListener("uievent", this);
  }

  unMount(): void {
    super.unMount();
    uiSignaller.removeEventListener("uievent", this);
  }
}

export function createMainMenu(): Container {
  return new MainMenu();
}
