import { GSSolver, NaiveBroadphase, World, WorldOptions } from "rewild-physics";
import { performanceNow } from "../../Imports";
import { contactMaterials } from "./Materials";

class PhysicsManager {
  world: World;
  lastCallTime: f32 = 0;
  private resetCallTime: boolean = false;

  constructor() {
    const physicsWorldOptions = new WorldOptions();
    physicsWorldOptions.gravity.set(0, -9.8, 0);
    const world = new World(physicsWorldOptions);
    world.broadphase = new NaiveBroadphase();
    (world.solver as GSSolver).iterations = 10;
    world.defaultContactMaterial.contactEquationStiffness = 1e7;
    world.defaultContactMaterial.contactEquationRelaxation = 4;

    // Setup contact materials
    for (let i: i32 = 0, l = contactMaterials.length; i < l; i++) {
      const contactMaterial = unchecked(contactMaterials[i]);
      world.addContactMaterial(contactMaterial);
    }

    this.world = world;
  }

  reset(): void {
    this.lastCallTime = 0;
  }

  update(): void {
    // Step world
    const timeStep: f32 = 1.0 / 60.0;
    const now = f32(performanceNow() / 1000);

    if (!this.lastCallTime) {
      // last call time not saved, cant guess elapsed time. Take a simple step.
      this.world.step(timeStep, 0);
      this.lastCallTime = now;
      return;
    }

    let timeSinceLastCall = now - this.lastCallTime;
    if (this.resetCallTime) {
      timeSinceLastCall = 0;
      this.resetCallTime = false;
    }

    this.world.step(timeStep, timeSinceLastCall);

    this.lastCallTime = now;
  }
}

export const physicsManager = new PhysicsManager();
