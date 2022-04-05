import { OrbitController } from "../../../extras/OrbitController";
import { AmbientLight } from "../../../lights/AmbientLight";
import { DirectionalLight } from "../../../lights/DirectionalLight";
import { Color } from "../../../math/Color";
import { Container } from "../core/Container";
import { inputManager } from "../../../exports/io/InputManager";
import { KeyboardEvent } from "../../../exports/io/KeyboardEvent";
import { Listener } from "../../../core/EventDispatcher";
import { uiSignaller } from "../../../exports/ui/uiSignalManager";
import { Event } from "../../../core/Event";
import { Mesh } from "../../Mesh";
import { UIEventType } from "../../../../common/UIEventType";
import { UIEvent } from "../../../exports/ui/UIEvent";
import { Link } from "../core/Link";

const playerHungerThreshold: u32 = 5;

export class Level1 extends Container implements Listener {
  orbitController!: OrbitController;
  totalTime: f32;
  playerDied: bool;
  isPaused: bool;

  private direction1!: DirectionalLight;
  private direction2!: DirectionalLight;
  private direction3!: DirectionalLight;
  private ambient!: AmbientLight;

  constructor() {
    super("Level1");
    this.totalTime = 0;
    this.playerDied = false;
    this.isPaused = false;
  }

  init(): void {
    super.init();
    const link = new Link();
    const mainMenu = this.runtime!.getNode("MainMenu");
    link.connect(this.getPortal("Exit")!, mainMenu!.getPortal("Enter")!);

    this.direction1 = new DirectionalLight(new Color(1, 1, 1), 3.1416);
    this.direction1.position.set(0, 10, 0);
    this.direction1.target.position.set(0, 0, 0);
    this.addAsset(this.direction1);

    this.direction2 = new DirectionalLight(new Color(0, 1, 0), 1.1416);
    this.direction2.position.set(10, -10, 0);
    this.direction2.target.position.set(0, 0, 0);
    this.addAsset(this.direction2);

    this.direction3 = new DirectionalLight(new Color(1, 1, 0), 2.1416);
    this.direction3.position.set(-10, -10, 0);
    this.direction3.target.position.set(0, 0, 0);
    this.addAsset(this.direction3);

    this.ambient = new AmbientLight(new Color(1, 1, 1), 0.1);
    this.addAsset(this.ambient);

    this.orbitController = new OrbitController(this.runtime!.camera);
  }

  onEvent(event: Event): void {
    if (event.attachment instanceof KeyboardEvent) {
      const keyEvent = event.attachment as KeyboardEvent;
      if (!this.playerDied) {
        if (keyEvent.code == "Escape") {
          this.isPaused = !this.isPaused;
          uiSignaller.signalClientEvent(UIEventType.OpenInGameMenu);
        }
      }
    } else {
      const uiEvent = event.attachment as UIEvent;
      if (uiEvent.eventType == UIEventType.QuitGame) this.exit(this.getPortal("Exit")!, true);
      else if (uiEvent.eventType == UIEventType.Resume) this.isPaused = false;
    }
  }

  onUpdate(delta: f32, total: u32, fps: u32): void {
    if (this.isPaused) return;

    const objects = this.objects;
    this.totalTime += delta;

    if (u32(this.totalTime) > playerHungerThreshold && this.playerDied == false) {
      this.playerDied = true;
      uiSignaller.signalClientEvent(UIEventType.PlayerDied);
    }

    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      if (objects[i] instanceof Mesh) {
        objects[i].rotation.x += delta * 1;
        objects[i].rotation.y += delta * 1;
        objects[i].position.y = Mathf.sin(this.totalTime + objects[i].position.x);
      }
    }

    if (this.orbitController && !this.playerDied) this.orbitController.update();
  }

  mount(): void {
    super.mount();
    this.totalTime = 0;
    this.playerDied = false;
    this.isPaused = false;

    this.objects[0].position.set(0, 0, 0);
    this.objects[1].position.set(3, 0, 0);
    this.objects[2].position.set(-3, 0, 0);
    this.objects[2].rotation.y += 0.8;

    // Possitive z comes out of screen
    this.runtime!.camera.position.set(0, 0, 10);
    this.runtime!.camera.lookAt(0, 0, 0);

    // this.orbitController = new OrbitController(this.runtime!.camera);

    inputManager.addEventListener("keyup", this);
    uiSignaller.addEventListener("uievent", this);
  }

  unMount(): void {
    super.unMount();
    inputManager.removeEventListener("keyup", this);
    uiSignaller.removeEventListener("uievent", this);
  }
}

export function createLevel1(): Level1 {
  return new Level1();
}
