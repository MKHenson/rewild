import { OrbitController } from "../../../extras/OrbitController";
import { PointerLockController } from "../../../extras/PointerLockController";
import { AmbientLight } from "../../../lights/AmbientLight";
import { DirectionalLight } from "../../../lights/DirectionalLight";
import { Color, degToRad, ApplicationEventType, UIEventType } from "rewild-common";
import { Container } from "../core/Container";
import { inputManager } from "../../../extras/io/InputManager";
import { KeyboardEvent } from "../../../extras/io/KeyboardEvent";
import { Listener } from "../../../core/EventDispatcher";
import { uiSignaller } from "../../../extras/ui/uiSignalManager";
import { Event } from "../../../core/Event";
import { ApplicationEvent } from "../../../extras/ui/ApplicationEvent";
import { Link } from "../core/Link";
import { TransformNode } from "../../../core/TransformNode";
import { lock, unlock } from "../../../Imports";
import { PlayerComponent } from "../../../components/PlayerComponent";
import { BodyOptions, World, WorldOptions } from "../../../physics/core/World";
import { RigidBody } from "../../../physics/core/RigidBody";
import { ShapeConfig } from "../../../physics/shape/ShapeConfig";
import { Vec3 } from "../../../physics/math/Vec3";

const vec: Vec3 = new Vec3();

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
  private sphereBody: RigidBody | null;
  private playerBody: RigidBody | null;
  private world: World | null;

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

    // this.orbitController = new OrbitController(this.runtime!.camera);
    this.pointerController = new PointerLockController(this.runtime!.camera);

    const physicsWorldOptions = new WorldOptions();
    physicsWorldOptions.gravity.set(0, -9.8, 0);
    this.world = new World(physicsWorldOptions);
  }

  onEvent(event: Event): void {
    if (event.attachment instanceof KeyboardEvent) {
      const keyEvent = event.attachment as KeyboardEvent;
      if (!this.player.isDead) {
        if (keyEvent.code == "Escape") {
          this.isPaused = !this.isPaused;
          if (this.isPaused) unlock();
          else lock();
          uiSignaller.signalClientEvent(ApplicationEventType.OpenInGameMenu);
        }
      }
    } else {
      const uiEvent = event.attachment as ApplicationEvent;
      if (uiEvent.eventType == ApplicationEventType.Quit) this.exit(this.getPortal("Exit")!, true);
      else if (uiEvent.eventType == ApplicationEventType.Resume) {
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

    this.playerBody!.setPosition(
      vec.set(
        this.pointerController.camera.position.x,
        this.pointerController.camera.position.y,
        this.pointerController.camera.position.z
      )
    );

    if (this.player.isDead) {
      // this.orbitController.enabled = false;
      this.pointerController.enabled = false;
    }

    // for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
    // if (objects[i] == this.ball) {
    //   objects[i].rotation.x += delta * 1;
    //   objects[i].rotation.y += delta * 1;
    //   objects[i].position.y = Mathf.sin(this.totalTime + objects[i].position.x) + 2;
    //   break;
    // }
    // }

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

    // Possitive z comes out of screen
    this.runtime!.camera.position.set(0, 1, 50);
    this.runtime!.camera.lookAt(0, 0, 0);
    // this.orbitController.enabled = true;
    this.pointerController.enabled = true;

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
        options.pos.set(obj.position.x, obj.position.y, obj.position.z);
        options.size.set(5, height, 5);
        this.world!.initBody("box", options);
      }
    }

    if (this.sphereBody != null) {
      this.world!.removeRigidBody(this.sphereBody!);
      this.world!.removeRigidBody(this.playerBody!);
    }
    const playerOptions = new BodyOptions();
    playerOptions.pos.set(
      this.runtime!.camera.position.x,
      this.runtime!.camera.position.y,
      this.runtime!.camera.position.z
    );
    playerOptions.size.set(1, 1, 1);
    playerOptions.move = true;
    playerOptions.kinematic = true;
    this.playerBody = this.world!.initBody("sphere", playerOptions);

    const sphereOptions = new BodyOptions();
    sphereOptions.size.set(1, 1, 1);
    sphereOptions.move = true;
    sphereOptions.pos.set(0, 10, 0);
    const sphereConfifg = new ShapeConfig();
    sphereConfifg.friction = 0.2;
    sphereConfifg.density = 20.0;
    sphereConfifg.restitution = 0.9;

    this.sphereBody = this.world!.initBody("sphere", sphereOptions, sphereConfifg);
    this.sphereBody!.connectMesh(this.ball);

    this.ball.position.set(0, 0, 0);
    this.floor.scale.set(200, 200, 200);
    this.floor.position.set(0, -0.1, 0);
    this.floor.rotation.x = -degToRad(90);

    const floorOptions = new BodyOptions();
    // floorOptions.pos.set(0, -40, 0);
    //floorOptions.size.set(200, 80, 200);
    floorOptions.pos.set(0, 0, 0);
    floorOptions.rot.set(-90, 0, 0);

    const floorConfifg = new ShapeConfig();
    floorConfifg.friction = 0.2;
    floorConfifg.density = 100;
    floorConfifg.restitution = 0.2;
    this.world!.initBody("plane", floorOptions, floorConfifg);

    this.sbybox.scale.set(200, 200, 200);
    this.sbybox.position.set(0, 0, 0);

    inputManager.addEventListener("keyup", this);
    uiSignaller.addEventListener(UIEventType, this);
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
    uiSignaller.removeEventListener(UIEventType, this);
  }
}
