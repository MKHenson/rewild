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
// import { BodyOptions, World, WorldOptions } from "../../../physics/core/World";
// import { RigidBody } from "../../../physics/core/RigidBody";
// import { ShapeConfig } from "../../../physics/shape/ShapeConfig";
import { Vec3 } from "../../../physics/math/Vec3";
import {
  World,
  WorldOptions,
  NaiveBroadphase,
  GSSolver,
  Plane,
  Body,
  BodyOptions,
  Box,
  Vec3 as Vec3Physics,
  Sphere,
} from "rewild-physics";

const vec: Vec3 = new Vec3();

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
  // private floor!: TransformNode;
  private skybox!: TransformNode;
  private ball!: TransformNode;

  private lastCallTime: f32 = 0;
  private resetCallTime: boolean = false;
  // private sphereBody: RigidBody | null;
  // private playerBody: RigidBody | null;
  private sphereBody: Body | null;
  private playerBody: Body | null;
  private world: World | null;

  private gravity: f32 = -9.8;

  constructor(name: string) {
    super(name);
    this.totalTime = 0;
    this.isPaused = false;
    this.world = null;
    this.sphereBody = null;
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

    // Setup physics world
    const physicsWorldOptions = new WorldOptions();
    physicsWorldOptions.gravity.set(0, 0, this.gravity);

    this.world = new World(physicsWorldOptions);
    this.world.broadphase = new NaiveBroadphase();
    (this.world.solver as GSSolver).iterations = 10;
    this.world.defaultContactMaterial.contactEquationStiffness = 1e7;
    this.world.defaultContactMaterial.contactEquationRelaxation = 4;
  }

  updatePhysics(): void {
    // Step world
    const timeStep: f32 = 1.0 / 60.0;
    const now = f32(performance.now() / 1000);

    if (!this.lastCallTime) {
      // last call time not saved, cant guess elapsed time. Take a simple step.
      this.world!.step(timeStep, 0);
      this.lastCallTime = now;
      return;
    }

    let timeSinceLastCall = now - this.lastCallTime;
    if (this.resetCallTime) {
      timeSinceLastCall = 0;
      this.resetCallTime = false;
    }

    this.world!.step(timeStep, timeSinceLastCall);

    this.lastCallTime = now;
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

    this.updatePhysics();
    // this.world!.step();
    this.totalTime += delta;

    const camera = this.runtime!.camera;
    const camPos = camera.position;
    this.skybox.position.set(camPos.x, camPos.y, camPos.z);

    if (!this.useOrbitController) {
      let yValue = camPos.y + this.gravity * delta;
      if (yValue < 0) yValue = 0;
      camPos.set(camPos.x, yValue, camPos.z);

      // this.playerBody!.setPosition(vec.set(camPos.x, camPos.y, camPos.z));
    }

    if (this.sphereBody) {
      const bodyPos = this.sphereBody!.interpolatedPosition;
      const bodyQuat = this.sphereBody!.interpolatedQuaternion;
      this.ball.position.set(bodyPos.x, bodyPos.y, bodyPos.z);
      this.ball.quaternion.set(bodyQuat.x, bodyQuat.y, bodyQuat.z, bodyQuat.w);
    }

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

    this.player = this.findObjectByName("player")!
      .components[0] as PlayerComponent;
    this.player.onRestart();

    // this.floor = this.findObjectByName("floor")!;
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

        // Shape on plane
        const boxShape = new Box(new Vec3Physics(5, height, 5));
        const shapeBody = new Body(
          new BodyOptions()
            .setMass(30)
            .setPosition(
              new Vec3Physics(obj.position.x, obj.position.y, obj.position.z)
            )
            .setShape(boxShape)
        );
        this.world!.add(shapeBody);

        // const options = new BodyOptions();
        // options.pos.set(obj.position.x, obj.position.y, obj.position.z);
        // options.size.set(5, height, 5);
        // this.world!.initBody("box", options);
      }
    }

    // if (this.sphereBody != null) {
    //   this.world!.removeRigidBody(this.sphereBody!);
    //   this.world!.removeRigidBody(this.playerBody!);
    // }
    if (this.sphereBody != null) {
      this.world!.removeBody(this.sphereBody!);
      this.world!.removeBody(this.playerBody!);
    }

    // Player physics
    // const playerOptions = new BodyOptions().setPosition(
    //   new Vec3Physics(this.runtime!.camera.position.x, this.runtime!.camera.position.y, this.runtime!.camera.position.z)
    // ).setShape(new Sphere(1));
    // playerOptions.pos.set(
    //   this.runtime!.camera.position.x,
    //   this.runtime!.camera.position.y,
    //   this.runtime!.camera.position.z
    // );

    // playerOptions.size.set(1, 1, 1);
    // playerOptions.move = true;
    // playerOptions.kinematic = true;
    // this.playerBody = this.world!.initBody("sphere", playerOptions);

    // Sphere physics
    const sphereOptions = new BodyOptions()
      .setPosition(new Vec3Physics(0, 10, 0))
      .setShape(new Sphere(1))
      .setMass(30);
    this.sphereBody = new Body(sphereOptions);
    this.world!.add(this.sphereBody);
    // sphereOptions.size.set(1, 1, 1);
    // sphereOptions.move = true;
    // sphereOptions.pos.set(0, 10, 0);
    // const sphereConfifg = new ShapeConfig();
    // sphereConfifg.friction = 0.2;
    // sphereConfifg.density = 20.0;
    // sphereConfifg.restitution = 0.9;

    // this.sphereBody = this.world!.initBody("sphere", sphereOptions, sphereConfifg);
    // this.sphereBody!.connectMesh(this.ball);

    this.ball.position.set(0, 0, 0);

    // GROUND PLANE
    var groundShape = new Plane();
    var groundBody = new Body(new BodyOptions().setMass(0));

    // new CANNON.Body({ mass: 0 });
    groundBody.addShape(groundShape);
    this.world!.add(groundBody);

    // const floorOptions = new BodyOptions();
    // floorOptions.pos.set(0, 0, 0);
    // floorOptions.rot.set(-90, 0, 0);

    // const floorConfifg = new ShapeConfig();
    // floorConfifg.friction = 0.2;
    // floorConfifg.density = 100;
    // floorConfifg.restitution = 0.2;
    // this.world!.initBody("plane", floorOptions, floorConfifg);

    this.skybox.scale.set(5000, 5000, 5000);
    this.skybox.position.set(0, 0, 0);

    inputManager.addEventListener("keyup", this);
    uiSignaller.addEventListener(UIEventType, this);
    // this.world!.play();

    if (!this.useOrbitController) lock();
  }

  unMount(): void {
    super.unMount();
    // this.world!.stop();
    // this.world!.clear();
    this.orbitController.enabled = false;
    this.pointerController.enabled = false;
    inputManager.removeEventListener("keyup", this);
    uiSignaller.removeEventListener(UIEventType, this);
  }
}
