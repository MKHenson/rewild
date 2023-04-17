import { Component } from "../core/Component";
import { uiSignaller } from "../extras/ui/uiSignalManager";
import { ApplicationEventType } from "rewild-common";
import { unlock } from "../Imports";

export class PlayerComponent extends Component {
  readonly dataProperties: Int32Array;
  private hungerTimer: f32;
  private criticalHungerTimer: f32;

  constructor() {
    super();

    this.hungerTimer = 0;
    this.criticalHungerTimer = 0;
    this.dataProperties = new Int32Array(3);
    this.dataProperties[0] = 100;
    this.dataProperties[1] = 0;
    this.dataProperties[2] = 100;
  }

  onUpdate(delta: f32, total: u32): void {
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
  }

  onRestart(): void {
    this.isDead = false;
    this.hunger = 100;
    this.health = 100;
  }

  onPlayerDied(): void {
    unlock();
    this.isDead = true;
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
