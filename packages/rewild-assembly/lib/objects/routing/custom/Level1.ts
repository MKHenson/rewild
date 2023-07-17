import { OrbitController } from "../../../extras/OrbitController";
import { PointerLockController } from "../../../extras/PointerLockController";
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
import { inputManager } from "../../../extras/io/InputManager";
import { KeyboardEvent } from "../../../extras/io/KeyboardEvent";
import { uiSignaller } from "../../../extras/ui/uiSignalManager";
import { ApplicationEvent } from "../../../extras/ui/ApplicationEvent";
import { Link } from "../core/Link";
import { TransformNode } from "../../../core/TransformNode";
import { lock, unlock } from "../../../Imports";
import { PlayerComponent } from "../../../components/PlayerComponent";
import {
  Plane,
  Body,
  BodyOptions,
  Vec3 as Vec3Physics,
  Sphere,
  Material,
} from "rewild-physics";
import { PhysicsComponent } from "../../../components/PhysicsComponent";

export class Level1 extends Container implements Listener {
  private orbitController!: OrbitController;
  private pointerController!: PointerLockController;
  private totalTime: f32;
  private isPaused: boolean;
  private useOrbitController: boolean;
  private player!: PlayerComponent;
  private direction1!: DirectionalLight;
  private direction2!: DirectionalLight;
  private direction3!: DirectionalLight;
  private ambient!: AmbientLight;
  private skybox!: TransformNode;
  private ball!: TransformNode;

  private groundBody: Body | null;
  // private sphereBody: Body | null;
  private playerBody: Body | null;

  private gravity: f32 = -9.8;

  constructor(name: string) {
    super(name);
    this.totalTime = 0;
    this.isPaused = false;
    // this.sphereBody = null;
    this.playerBody = null;
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

    this.useOrbitController = false;
    this.orbitController = new OrbitController(this.runtime!.camera);
    this.pointerController = new PointerLockController(this.runtime!.camera);

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

    // Sphere physics

    // Player physics
    const playerOptions = new BodyOptions()
      .setPosition(
        new Vec3Physics(
          this.runtime!.camera.position.x,
          this.runtime!.camera.position.y,
          this.runtime!.camera.position.z
        )
      )
      .setShape(new Sphere(1))
      .setType(Body.KINEMATIC);
    this.playerBody = new Body(playerOptions);
  }

  onEvent(event: Event): void {
    if (event.attachment instanceof KeyboardEvent) {
      const keyEvent = event.attachment as KeyboardEvent;

      if (!this.player.isDead) {
        if (keyEvent.code == "Escape") {
          this.isPaused = !this.isPaused;

          if (this.isPaused) unlock();
          else if (!this.useOrbitController) lock();

          uiSignaller.signalClientEvent(ApplicationEventType.OpenInGameMenu);
        } else if (keyEvent.code == "KeyC") {
          this.useOrbitController = !this.useOrbitController;
          if (!this.useOrbitController) lock();
          else unlock();
        }
      }
    } else {
      const uiEvent = event.attachment as ApplicationEvent;
      if (uiEvent.eventType == ApplicationEventType.Quit)
        this.exit(this.getPortal("Exit")!, true);
      else if (uiEvent.eventType == ApplicationEventType.Resume) {
        this.isPaused = false;
        if (!this.useOrbitController) lock();
      }
    }

    this.pointerController.enabled = this.useOrbitController
      ? false
      : !this.isPaused && !this.player.isDead;
    this.orbitController.enabled = this.useOrbitController
      ? !this.isPaused && !this.player.isDead
      : false;
  }

  onUpdate(delta: f32, total: u32): void {
    if (this.isPaused) return;
    super.onUpdate(delta, total);

    this.totalTime += delta;

    const camera = this.runtime!.camera;
    const camPos = camera.position;
    this.skybox.position.set(camPos.x, camPos.y, camPos.z);

    if (!this.useOrbitController) {
      let yValue = camPos.y + this.gravity * delta;
      if (yValue < 0) yValue = 0;
      camPos.set(camPos.x, yValue, camPos.z);

      this.playerBody!.position.set(camPos.x, camPos.y, camPos.z);
    }

    // if (this.sphereBody) {
    //   const bodyPos = this.sphereBody!.interpolatedPosition;
    //   const bodyQuat = this.sphereBody!.interpolatedQuaternion;
    //   this.ball.position.set(bodyPos.x, bodyPos.y, bodyPos.z);
    //   this.ball.quaternion.set(bodyQuat.x, bodyQuat.y, bodyQuat.z, bodyQuat.w);
    // }

    if (this.player.isDead) {
      this.orbitController.enabled = false;
      this.pointerController.enabled = false;
    }

    if (this.orbitController && this.useOrbitController)
      this.orbitController.update();
    if (this.pointerController && !this.useOrbitController)
      this.pointerController.update(delta);
  }

  getRandomArbitrary(min: f32, max: f32): f32 {
    return Mathf.random() * (max - min) + min;
  }

  mount(): void {
    super.mount();
    this.totalTime = 0;
    this.isPaused = false;
    this.runtime!.lastCallTime = 0;

    this.player = this.findObjectByName("player")!
      .components[0] as PlayerComponent;
    this.player.onRestart();

    this.ball = this.findObjectByName("ball")!;
    this.skybox = this.findObjectByName("skybox")!;

    // Possitive z comes out of screen
    this.runtime!.camera.position.set(0, 1, 50);
    this.runtime!.camera.lookAt(0, 0, 0);
    this.orbitController.enabled = true;
    this.pointerController.enabled = true;

    const objects = this.objects;
    for (let i: i32 = 0, l = objects.length; i < l; i++) {
      const obj = objects[i];

      if (obj.name.includes("crate")) {
        obj.position.set(
          this.getRandomArbitrary(-100, 100),
          0.5,
          this.getRandomArbitrary(-100, 100)
        );
        obj.rotation.y = Mathf.random() * Mathf.PI;
      } else if (obj.name.includes("building")) {
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
    // world.add(this.sphereBody!);
    world.add(this.playerBody!);
    const component = this.ball.getComponent("physics") as PhysicsComponent;

    // component.rigidBody.position.set(0, 20, 0);
    // component.rigidBody.velocity.set(0, 0, 0);
    // component.rigidBody.angularVelocity.set(0, 0, 0);

    this.skybox.scale.set(5000, 5000, 5000);
    this.skybox.position.set(0, 0, 0);

    inputManager.addEventListener("keyup", this);
    uiSignaller.addEventListener(UIEventType, this);

    this.useOrbitController = false;
    lock();
  }

  unMount(): void {
    super.unMount();
    const world = this.runtime!.world;
    world.removeBody(this.groundBody!);
    // world.removeBody(this.sphereBody!);
    world.removeBody(this.playerBody!);
    this.orbitController.enabled = false;
    this.pointerController.enabled = false;
    inputManager.removeEventListener("keyup", this);
    uiSignaller.removeEventListener(UIEventType, this);
  }
}
