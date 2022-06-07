import { PlayerComponent } from "../components/PlayerComponent";
export { createPlayerComponent, getPlayerComponentProperties } from "../components/PlayerComponent";

export function getPlayerHealth(component: PlayerComponent): i32 {
  return component.health;
}

export function setPlayerHealth(component: PlayerComponent, val: i32): void {
  component.health = val;
}

export function getPlayerIsDead(component: PlayerComponent): boolean {
  return component.isDead;
}
export function setPlayerIsDead(component: PlayerComponent, val: boolean): void {
  component.isDead = val;
}

export function getPlayerHunger(component: PlayerComponent): i32 {
  return component.hunger;
}
export function setPlayerHunger(component: PlayerComponent, val: i32): void {
  component.hunger = val;
}
