import { IActor, Vector3 } from "models";
import { Component, PhysicsComponent, wasm } from "packages/rewild-wasmtime";

export type LoaderPresetType = "crate" | "planet";

export const LoaderPresets: { [key in LoaderPresetType]: (actor: IActor) => Component } = {
  crate: (actor) => {
    const physicsComponent = new PhysicsComponent(wasm.createBodyBox(0.5, 0.5, 0.5, 30));
    physicsComponent.mass = 30;

    const position = actor.properties.find((prop) => prop.type === "position")?.value as Vector3;

    if (position) {
      physicsComponent.positionX = position[0];
      physicsComponent.positionY = position[1];
      physicsComponent.positionZ = position[2];
    }

    return physicsComponent;
  },
  planet: (actor) => {
    const size = actor.properties.find((prop) => prop.type === "size")?.value;
    const speed = actor.properties.find((prop) => prop.type === "speed")?.value;

    const component = new Component(wasm.createPlanetComponent(size as number, speed as number));
    return component;
  },
};
