import { OrbitController } from "../../../extras/OrbitController";
import { PointerLockController } from "../../../extras/PointerLockController";
import { AmbientLight } from "../../../lights/AmbientLight";
import { DirectionalLight } from "../../../lights/DirectionalLight";
import { Color } from "../../../../common/math/Color";
import { Container } from "../core/Container";
import { inputManager } from "../../../extras/io/InputManager";
import { KeyboardEvent } from "../../../extras/io/KeyboardEvent";
import { Listener } from "../../../core/EventDispatcher";
import { uiSignaller } from "../../../extras/ui/uiSignalManager";
import { Event } from "../../../core/Event";
import { UIEventType } from "../../../../common/UIEventType";
import { UIEvent } from "../../../extras/ui/UIEvent";
import { Link } from "../core/Link";
import { TransformNode } from "../../../core/TransformNode";
import { lock, unlock } from "../../../Imports";
import { degToRad } from "../../../../common/math/MathUtils";
import { PlayerComponent } from "../../../components/PlayerComponent";
import { BodyOptions, World } from "../../../physics/core/World";

export class Level1 extends Container implements Listener {
  orbitController!: OrbitController;
  pointerController!: PointerLockController;
  totalTime: f32;
  isPaused: boolean;

  private player!: PlayerComponent;
  private direction1!: DirectionalLight;
  private direction2!: DirectionalLight;
  private direction3!: DirectionalLight;
  private ambient!: AmbientLight;
  private floor!: TransformNode;
  private sbybox!: TransformNode;
  private ball!: TransformNode;

  private world: World | null;

  constructor() {
    super("Level1");
    this.totalTime = 0;
    this.isPaused = false;
    this.world = null;
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

    this.ambient = new AmbientLight(new Color(1, 1, 1), 0.4);
    this.addAsset(this.ambient);

    // this.orbitController = new OrbitController(this.runtime!.camera);
    this.pointerController = new PointerLockController(this.runtime!.camera);
    this.world = new World();
  }

  onEvent(event: Event): void {
    if (event.attachment instanceof KeyboardEvent) {
      const keyEvent = event.attachment as KeyboardEvent;
      if (!this.player.isDead) {
        if (keyEvent.code == "Escape") {
          this.isPaused = !this.isPaused;
          if (this.isPaused) unlock();
          else lock();
          uiSignaller.signalClientEvent(UIEventType.OpenInGameMenu);
        }
      }
    } else {
      const uiEvent = event.attachment as UIEvent;
      if (uiEvent.eventType == UIEventType.QuitGame) this.exit(this.getPortal("Exit")!, true);
      else if (uiEvent.eventType == UIEventType.Resume) {
        this.isPaused = false;
        lock();
      }
    }

    this.pointerController.enabled = !this.isPaused && !this.player.isDead;
  }

  onUpdate(delta: f32, total: u32): void {
    if (this.isPaused) return;
    super.onUpdate(delta, total);

    this.world!.step();

    const objects = this.objects;
    this.totalTime += delta;

    if (this.player.isDead) {
      // this.orbitController.enabled = false;
      this.pointerController.enabled = false;
    }

    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      if (objects[i] == this.ball) {
        objects[i].rotation.x += delta * 1;
        objects[i].rotation.y += delta * 1;
        objects[i].position.y = Mathf.sin(this.totalTime + objects[i].position.x) + 2;
        break;
      }
    }

    // if (this.orbitController) this.orbitController.update();
    if (this.pointerController) this.pointerController.update(delta);
  }

  getRandomArbitrary(min: f32, max: f32): f32 {
    return Mathf.random() * (max - min) + min;
  }

  mount(): void {
    super.mount();
    this.totalTime = 0;
    this.isPaused = false;

    this.player = this.findObjectByName("player")!.components[0] as PlayerComponent;
    this.player.onRestart();

    this.floor = this.findObjectByName("floor")!;
    this.ball = this.findObjectByName("ball")!;
    this.sbybox = this.findObjectByName("skybox")!;

    const objects = this.objects;
    for (let i: i32 = 0, l = objects.length; i < l; i++) {
      const obj = objects[i];

      if (obj.name.includes("crate")) {
        obj.position.set(this.getRandomArbitrary(-100, 100), 0.5, this.getRandomArbitrary(-100, 100));
        obj.rotation.y = Mathf.random() * Mathf.PI;
      } else if (obj.name.includes("building")) {
        const height = this.getRandomArbitrary(5, 10);
        obj.position.set(this.getRandomArbitrary(-100, 100), height / 2, this.getRandomArbitrary(-100, 100));
        obj.scale.set(5, height, 5);

        const options = new BodyOptions();
        options.pos = [obj.position.x, obj.position.y, obj.position.z];
        options.size = [5, height, 5];

        this.world!.initBody(["box"], options);
      }
    }

    this.ball.position.set(3, 3, 0);
    this.floor.scale.set(200, 200, 200);
    this.floor.position.set(0, -0.1, 0);
    this.floor.rotation.x = -degToRad(90);

    const floorOptions = new BodyOptions();
    floorOptions.pos = [0, 0, 0];
    floorOptions.size = [200, 0.1, 200];
    this.world!.initBody(["box"], floorOptions);

    this.sbybox.scale.set(200, 200, 200);
    this.sbybox.position.set(0, 0, 0);

    // Possitive z comes out of screen
    this.runtime!.camera.position.set(0, 1, 10);
    this.runtime!.camera.lookAt(0, 0, 0);
    // this.orbitController.enabled = true;
    this.pointerController.enabled = true;

    inputManager.addEventListener("keyup", this);
    uiSignaller.addEventListener("uievent", this);
    this.world!.play();
    lock();
  }

  unMount(): void {
    super.unMount();
    this.world!.stop();
    this.world!.clear();
    // this.orbitController.enabled = false;
    this.pointerController.enabled = false;
    inputManager.removeEventListener("keyup", this);
    uiSignaller.removeEventListener("uievent", this);
  }
}

export function createLevel1(): Container {
  return new Level1();
}
