import { AmbientLight } from "../../../lights/AmbientLight";
import { DirectionalLight } from "../../../lights/DirectionalLight";
import {
  Color,
  ApplicationEventType,
  UIEventType,
  Listener,
  Event,
  degToRad,
} from "rewild-common";
import { Container } from "../core/Container";
import { uiSignaller } from "../../../extras/ui/uiSignalManager";
import { ApplicationEvent } from "../../../extras/ui/ApplicationEvent";
import { Link } from "../core/Link";
import { TransformNode } from "../../../core/TransformNode";
import {
  Plane,
  Body,
  BodyOptions,
  Vec3 as Vec3Physics,
  Material,
} from "rewild-physics";
import { physicsManager } from "../../physics/PhysicsManager";
import { groundMaterial } from "../../physics/Materials";

export class Level1 extends Container implements Listener {
  private totalTime: f32;
  private direction1!: DirectionalLight;
  private direction2!: DirectionalLight;
  private direction3!: DirectionalLight;
  private ambient!: AmbientLight;
  private groundBody: Body | null;

  constructor(name: string) {
    super(name, true);
    this.totalTime = 0;
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

    // GROUND PLANE
    this.groundBody = new Body(
      new BodyOptions()
        .setMass(0)
        .setShape(new Plane())
        .setMaterial(groundMaterial)
    );
    this.groundBody!.quaternion.setFromAxisAngle(
      new Vec3Physics(1, 0, 0),
      -degToRad(90)
    );
  }

  onEvent(event: Event): void {
    if (event.attachment instanceof ApplicationEvent) {
      const uiEvent = event.attachment as ApplicationEvent;
      if (uiEvent.eventType == ApplicationEventType.Quit)
        this.runtime!.sendSignal(this.getPortal("Exit")!, true);
    }
  }

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);
    this.totalTime += delta;
  }

  getRandomArbitrary(min: f32, max: f32): f32 {
    return Mathf.random() * (max - min) + min;
  }

  mount(): void {
    super.mount();
    this.totalTime = 0;
    physicsManager.reset();

    // Possitive z comes out of screen
    this.runtime!.camera.position.set(0, 1, 50);
    this.runtime!.camera.lookAt(0, 0, 0);

    const world = physicsManager.world;
    world.add(this.groundBody!);
    uiSignaller.addEventListener(UIEventType, this);
  }

  unMount(): void {
    super.unMount();
    const world = physicsManager.world;
    world.removeBody(this.groundBody!);
    uiSignaller.removeEventListener(UIEventType, this);
  }
}
