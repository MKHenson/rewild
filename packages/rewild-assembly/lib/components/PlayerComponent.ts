import { Component } from "../core/Component";
import { uiSignaller } from "../extras/ui/uiSignalManager";
import {
  ApplicationEventType,
  Event,
  Listener,
  UIEventType,
} from "rewild-common";
import { lock, unlock } from "../Imports";
import { Runtime } from "../objects/routing";
import { OrbitController } from "../extras/OrbitController";
import { PointerLockController } from "../extras/PointerLockController";
import { KeyboardEvent } from "../extras/io/KeyboardEvent";
import { ApplicationEvent } from "../extras/ui/ApplicationEvent";
import { Body, BodyOptions, Vec3, Sphere } from "rewild-physics";
import { inputManager } from "../extras/io/InputManager";

export class PlayerComponent extends Component implements Listener {
  readonly dataProperties: Int32Array;
  private hungerTimer: f32;
  private criticalHungerTimer: f32;
  private orbitController: OrbitController | null;
  private pointerController: PointerLockController | null;
  useOrbitController: boolean;
  private isPaused: boolean;
  private runtime: Runtime | null;
  private playerBody: Body | null;
  private gravity: f32 = -9.8;

  constructor() {
    super();

    this.hungerTimer = 0;
    this.criticalHungerTimer = 0;
    this.dataProperties = new Int32Array(3);
    this.dataProperties[0] = 100;
    this.dataProperties[1] = 0;
    this.dataProperties[2] = 100;
    this.useOrbitController = false;
    this.isPaused = false;
    this.runtime = null;
  }

  mount(runtime: Runtime): void {
    super.mount(runtime);
    this.runtime = runtime;
    this.isPaused = false;

    inputManager.addEventListener("keyup", this);
    uiSignaller.addEventListener(UIEventType, this);
    this.onRestart();

    if (this.orbitController == null) {
      this.orbitController = new OrbitController(runtime.camera);
      this.pointerController = new PointerLockController(runtime.camera);

      // Player physics
      const playerOptions = new BodyOptions()
        .setPosition(
          new Vec3(
            runtime.camera.position.x,
            runtime.camera.position.y,
            runtime.camera.position.z
          )
        )
        .setShape(new Sphere(1))
        .setType(Body.KINEMATIC);
      this.playerBody = new Body(playerOptions);
    }

    this.orbitController!.enabled = false;
    this.pointerController!.enabled = true;
    runtime.world.add(this.playerBody!);
    lock();
  }

  unMount(runtime: Runtime): void {
    super.unMount(runtime);
    this.runtime = null;

    inputManager.removeEventListener("keyup", this);
    uiSignaller.removeEventListener(UIEventType, this);

    this.orbitController!.enabled = false;
    this.pointerController!.enabled = false;
    runtime.world.removeBody(this.playerBody!);
  }

  onEvent(event: Event): void {
    const useOrbitController = this.useOrbitController;

    if (event.attachment instanceof KeyboardEvent) {
      const keyEvent = event.attachment as KeyboardEvent;

      if (!this.isDead) {
        if (keyEvent.code == "Escape") {
          this.isPaused = !this.isPaused;

          if (this.isPaused) unlock();
          else if (!useOrbitController) lock();

          uiSignaller.signalClientEvent(ApplicationEventType.OpenInGameMenu);
        } else if (keyEvent.code == "KeyC") {
          this.useOrbitController = !useOrbitController;
          if (!this.useOrbitController) lock();
          else unlock();
        }
      }
    } else {
      const uiEvent = event.attachment as ApplicationEvent;
      if (uiEvent.eventType == ApplicationEventType.Resume) {
        this.isPaused = false;
        if (!useOrbitController) lock();
      }
    }

    if (this.useOrbitController) {
      this.orbitController!.enabled = this.isPaused ? false : true;
      this.pointerController!.enabled = false;
    } else {
      this.pointerController!.enabled = this.isPaused ? false : true;
      this.orbitController!.enabled = false;
    }
  }

  onUpdate(delta: f32, total: u32): void {
    if (this.isPaused) return;

    this.hungerTimer += delta;
    this.criticalHungerTimer += delta;

    if (this.hungerTimer > 0.5) {
      this.hungerTimer = 0;

      if (this.hunger > 0) {
        this.hunger -= 1;
      }
    }

    if (this.hunger == 0 && this.criticalHungerTimer > 0.05) {
      this.criticalHungerTimer = 0;

      if (this.health > 0) {
        this.health -= 1;
      }
    }

    if (!this.isDead && this.health == 0) {
      this.onPlayerDied();
    }

    const camera = this.runtime!.camera;
    const camPos = camera.position;

    if (!this.useOrbitController) {
      let yValue = camPos.y + this.gravity * delta;
      if (yValue < 0) yValue = 0;
      camPos.set(camPos.x, yValue, camPos.z);

      this.playerBody!.position.set(camPos.x, camPos.y, camPos.z);
    }

    if (this.isDead) {
      this.orbitController!.enabled = false;
      this.pointerController!.enabled = false;
    }

    if (this.orbitController && this.useOrbitController)
      this.orbitController!.update();
    if (this.pointerController && !this.useOrbitController)
      this.pointerController!.update(delta);
  }

  onRestart(): void {
    this.isDead = false;
    this.hunger = 100;
    this.health = 100;
  }

  onPlayerDied(): void {
    unlock();
    this.isDead = true;
    this.pointerController!.enabled = false;
    this.orbitController!.enabled = false;
    uiSignaller.signalClientEvent(ApplicationEventType.PlayerDied);
  }

  get health(): i32 {
    return this.dataProperties[0];
  }

  set health(val: i32) {
    this.dataProperties[0] = val;
  }

  get isDead(): boolean {
    return this.dataProperties[1] === 0 ? false : true;
  }

  set isDead(val: boolean) {
    this.dataProperties[1] = val ? 1 : 0;
  }

  get hunger(): i32 {
    return this.dataProperties[2];
  }

  set hunger(val: i32) {
    this.dataProperties[2] = val;
  }
}

export function createPlayerComponent(): PlayerComponent {
  return new PlayerComponent();
}

export function getPlayerComponentProperties(player: PlayerComponent): usize {
  return changetype<usize>(player.dataProperties);
}
