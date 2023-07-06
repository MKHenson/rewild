import { Component } from "../core/Component";
import { Runtime } from "../objects/routing";

export class PlanetComponent extends Component {
  private spinSpeed: f32;
  private size: f32;

  constructor(size: f32 = 1, spinSpeed: f32 = 1) {
    super();

    this.spinSpeed = spinSpeed;
    this.size = size;
  }

  mount(runtime: Runtime): void {
    console.log(`Setting size to be ${this.size}`);
    this.transform!.scale.set(this.size, this.size, this.size);
    this.transform!.position.y += this.size;
  }

  onUpdate(delta: f32, total: u32): void {
    if (this.transform)
      this.transform!.rotation.y += delta * 0.1 * this.spinSpeed;
  }
}

export function createPlanetComponent(
  size: f32,
  spinSpeed: f32
): PlanetComponent {
  return new PlanetComponent(size, spinSpeed);
}
