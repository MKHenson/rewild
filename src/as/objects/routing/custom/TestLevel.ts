import { OrbitController } from "../../../extras/OrbitController";
import { Container } from "../core/Container";
import { inputManager } from "../../../exports/io/InputManager";
import { KeyboardEvent } from "../../../exports/io/KeyboardEvent";
import { Listener } from "../../../core/EventDispatcher";
import { uiSignaller } from "../../../exports/ui/uiSignalManager";
import { Event } from "../../../core/Event";
import { UIEvent } from "../../../exports/ui/UIEvent";
import { Link } from "../core/Link";
import { TransformNode } from "../../../core/TransformNode";

export class TestLevel extends Container implements Listener {
  orbitController!: OrbitController;
  private sbybox!: TransformNode;

  constructor() {
    super("TestLevel");
  }

  init(): void {
    super.init();
    const link = new Link();
    const mainMenu = this.runtime!.getNode("MainMenu");
    link.connect(this.getPortal("Exit")!, mainMenu!.getPortal("Enter")!);
    this.orbitController = new OrbitController(this.runtime!.camera);
  }

  onEvent(event: Event): void {
    if (event.attachment instanceof KeyboardEvent) {
      const keyEvent = event.attachment as KeyboardEvent;
    } else {
      const uiEvent = event.attachment as UIEvent;
    }
  }

  onUpdate(delta: f32, total: u32, fps: u32): void {
    if (this.orbitController) this.orbitController.update();
  }

  mount(): void {
    super.mount();

    this.sbybox = this.findObjectByName("skybox")!;
    this.sbybox.scale.set(2, 2, 2);
    this.sbybox.position.set(0, 0, 0);

    // Possitive z comes out of screen
    this.runtime!.camera.position.set(0, 1, 10);
    this.runtime!.camera.lookAt(0, 0, 0);

    inputManager.addEventListener("keyup", this);
    uiSignaller.addEventListener("uievent", this);
  }

  unMount(): void {
    super.unMount();
    inputManager.removeEventListener("keyup", this);
    uiSignaller.removeEventListener("uievent", this);
  }
}

export function createTestLevel(): Container {
  return new TestLevel();
}
