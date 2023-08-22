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

export class Level1 extends Container implements Listener {
  private totalTime: f32;
  private direction1!: DirectionalLight;
  private direction2!: DirectionalLight;
  private direction3!: DirectionalLight;
  private ambient!: AmbientLight;
  private skybox!: TransformNode;
  private ball!: TransformNode;
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
        .setMaterial(new Material("ground", 0.3))
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

    const camera = this.runtime!.camera;
    const camPos = camera.position;
    this.skybox.position.set(camPos.x, camPos.y, camPos.z);
  }

  getRandomArbitrary(min: f32, max: f32): f32 {
    return Mathf.random() * (max - min) + min;
  }

  mount(): void {
    super.mount();
    this.totalTime = 0;
    this.runtime!.lastCallTime = 0;

    this.ball = this.findObjectByName("ball")!;
    this.skybox = this.findObjectByName("skybox")!;

    // Possitive z comes out of screen
    this.runtime!.camera.position.set(0, 1, 50);
    this.runtime!.camera.lookAt(0, 0, 0);

    const objects = this.objects;
    for (let i: i32 = 0, l = objects.length; i < l; i++) {
      const obj = objects[i];

      // if (obj.name.includes("crate")) {
      //   obj.position.set(
      //     this.getRandomArbitrary(-100, 100),
      //     0.5,
      //     this.getRandomArbitrary(-100, 100)
      //   );
      //   obj.rotation.y = Mathf.random() * Mathf.PI;
      // } else
      if (obj.name.includes("building")) {
        const height = this.getRandomArbitrary(5, 10);
        obj.position.set(
          this.getRandomArbitrary(-100, 100),
          height / 2,
          this.getRandomArbitrary(-100, 100)
        );
        obj.scale.set(5, height, 5);

        // // Shape on plane
        // const boxShape = new Box(new Vec3Physics(5, height, 5));
        // const shapeBody = new Body(
        //   new BodyOptions()
        //     .setMass(30)
        //     .setPosition(
        //       new Vec3Physics(obj.position.x, obj.position.y, obj.position.z)
        //     )
        //     .setShape(boxShape)
        // );
        // this.world!.add(shapeBody);

        // const options = new BodyOptions();
        // options.pos.set(obj.position.x, obj.position.y, obj.position.z);
        // options.size.set(5, height, 5);
        // this.world!.initBody("box", options);
      }
    }

    const world = this.runtime!.world;
    world.add(this.groundBody!);
    this.skybox.scale.set(5000, 5000, 5000);
    this.skybox.position.set(0, 0, 0);
    uiSignaller.addEventListener(UIEventType, this);
  }

  unMount(): void {
    super.unMount();
    const world = this.runtime!.world;
    world.removeBody(this.groundBody!);
    uiSignaller.removeEventListener(UIEventType, this);
  }
}
