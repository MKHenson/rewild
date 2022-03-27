import { OrbitController } from "../../../extras/OrbitController";
import { AmbientLight } from "../../../lights/AmbientLight";
import { DirectionalLight } from "../../../lights/DirectionalLight";
import { Color } from "../../../math/Color";
import { Container } from "../core/Container";
import { inputManager } from "../../../exports/io/InputManager";
import { MouseEvent } from "../../../exports/io/MouseEvent";
import { Listener } from "../../../core/EventDispatcher";
import { Event } from "../../../core/Event";
import { Mesh } from "../../Mesh";

export class Level1 extends Container implements Listener {
  orbitController!: OrbitController;
  totalTime: f32;

  constructor() {
    super("Level1");
    this.totalTime = 0;
  }

  onEvent(event: Event): void {
    const mouseEvent = event.attachment as MouseEvent;
    mouseEvent;
  }

  onUpdate(delta: f32, total: u32, fps: u32): void {
    const objects = this.objects;
    this.totalTime += delta;

    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      if (objects[i] instanceof Mesh) {
        objects[i].rotation.x += delta * 1;
        objects[i].rotation.y += delta * 1;
        objects[i].position.y = Mathf.sin(this.totalTime + objects[i].position.x);
      }
    }

    if (this.orbitController) this.orbitController.update();
  }

  mount(): void {
    super.mount();

    const direction = new DirectionalLight(new Color(1, 1, 1), 3.1416);
    direction.position.set(0, 10, 0);
    direction.target.position.set(0, 0, 0);
    this.runtime!.scene.add(direction);
    this.addAsset(direction);

    const direction2 = new DirectionalLight(new Color(0, 1, 0), 1.1416);
    direction2.position.set(10, -10, 0);
    direction2.target.position.set(0, 0, 0);
    this.runtime!.scene.add(direction2);
    this.addAsset(direction2);

    const direction3 = new DirectionalLight(new Color(1, 1, 0), 2.1416);
    direction3.position.set(-10, -10, 0);
    direction3.target.position.set(0, 0, 0);
    this.runtime!.scene.add(direction3);
    this.addAsset(direction3);

    const ambient = new AmbientLight(new Color(1, 1, 1), 0.1);
    this.runtime!.scene.add(ambient);
    this.addAsset(ambient);

    this.objects[0].position.set(0, 0, 0);
    this.objects[1].position.set(3, 0, 0);
    this.objects[2].position.set(-3, 0, 0);
    this.objects[2].rotation.y += 0.8;

    // Possitive z comes out of screen
    this.runtime!.camera.position.set(0, 0, 10);
    this.runtime!.camera.lookAt(0, 0, 0);

    this.orbitController = new OrbitController(this.runtime!.camera);

    inputManager.addEventListener("mouseup", this);
  }

  unMount(): void {
    super.unMount();
  }
}

export function createLevel1(): Level1 {
  return new Level1();
}
