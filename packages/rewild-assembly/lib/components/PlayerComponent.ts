import { uiSignaller } from '../extras/ui/uiSignalManager';
import {
  ApplicationEventType,
  Event,
  Listener,
  UIEventType,
} from 'rewild-common';
import { lock, unlock } from '../Imports';
import { Runtime } from '../objects/Runtime';
import { OrbitController } from '../extras/OrbitController';
import { PointerLockController } from '../extras/PointerLockController';
import { KeyboardEvent } from '../extras/io/KeyboardEvent';
import { ApplicationEvent } from '../extras/ui/ApplicationEvent';
import { Body, BodyOptions, Vec3, Sphere } from 'rewild-physics';
import { inputManager } from '../extras/io/InputManager';
import { physicsManager } from '../objects/physics/PhysicsManager';
import { getRuntime } from '../tests';
import { BehaviourComponent } from './BehaviourComponent';
import { Raycaster } from '../core/Raycaster';
import { EngineVector3 } from '../math/Vector3';
import { Intersection } from './MeshComponent';

export class PlayerComponent extends BehaviourComponent implements Listener {
  hunger: i32;
  health: i32;
  isDead: boolean;
  private hungerTimer: f32;
  private criticalHungerTimer: f32;
  private orbitController: OrbitController | null;
  private pointerController: PointerLockController | null;
  useOrbitController: boolean;
  private isPaused: boolean;
  private runtime: Runtime | null;
  private playerBody: Body | null;
  private gravity: f32 = -9.8;
  private raycaster: Raycaster;
  private rayOrigin: EngineVector3;
  private rayDirection: EngineVector3;
  private intersections: Intersection[];
  private playerHeight: f32;

  constructor() {
    super();

    this.playerBody = null;
    this.orbitController = null;
    this.pointerController = null;
    this.hungerTimer = 0;
    this.criticalHungerTimer = 0;

    this.useOrbitController = false;
    this.isPaused = false;
    this.runtime = null;
    this.raycaster = new Raycaster();
    this.rayOrigin = new EngineVector3();
    this.rayDirection = new EngineVector3(0, -1, 0);
    this.intersections = [];
    this.playerHeight = 1.8;
    this.hunger = 100;
    this.isDead = false;
    this.health = 100;
  }

  mount(): void {
    super.mount();

    const runtime = getRuntime();
    this.runtime = runtime;
    this.isPaused = false;

    inputManager.addEventListener('keyup', this);
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
    physicsManager.world.add(this.playerBody!);
    lock();
  }

  unMount(): void {
    super.unMount();
    this.runtime = null;

    inputManager.removeEventListener('keyup', this);
    uiSignaller.removeEventListener(UIEventType, this);

    this.orbitController!.enabled = false;
    this.pointerController!.enabled = false;
    physicsManager.world.removeBody(this.playerBody!);
  }

  onEvent(event: Event): void {
    const useOrbitController = this.useOrbitController;

    if (event.attachment instanceof KeyboardEvent) {
      const keyEvent = event.attachment as KeyboardEvent;

      if (!this.isDead) {
        if (keyEvent.code == 'Escape') {
          this.isPaused = !this.isPaused;

          if (this.isPaused) unlock();
          else if (!useOrbitController) lock();

          uiSignaller.signalClientEvent(ApplicationEventType.OpenInGameMenu);
        } else if (keyEvent.code == 'KeyC') {
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

    this.rayOrigin.set(camPos.x, 1000, camPos.z);
    this.raycaster.set(this.rayOrigin, this.rayDirection);

    if (!this.useOrbitController) {
      this.intersections.length = 0;
      const intersections = this.intersections;

      this.raycaster.intersectObjects(
        this.runtime!.scene.children,
        true,
        intersections
      );

      let minValue: f32 = this.playerHeight;
      if (intersections.length > 0)
        minValue = intersections[0].point.y + this.playerHeight;

      let yValue = camPos.y + this.gravity * delta;
      if (yValue < minValue) yValue = minValue;

      yValue = 0;

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
}

export function createPlayerComponent(): PlayerComponent {
  return new PlayerComponent();
}

export function getPlayerHunger(player: PlayerComponent): i32 {
  return player.hunger;
}

export function setPlayerHunger(player: PlayerComponent, val: i32): void {
  player.hunger = val;
}

export function getPlayerHealth(player: PlayerComponent): i32 {
  return player.health;
}

export function setPlayerHealth(player: PlayerComponent, val: i32): void {
  player.health = val;
}

export function getPlayerIsDead(player: PlayerComponent): boolean {
  return player.isDead;
}

export function setPlayerIsDead(player: PlayerComponent, val: boolean): void {
  player.isDead = val;
}
