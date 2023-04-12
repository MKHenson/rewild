import { Component } from "../core/Component";

export class PlanetComponent extends Component {
  private spinSpeed: f32;
  private size: f32;

  constructor() {
    super();

    this.spinSpeed = 1;
    this.size = 1;
  }

  onUpdate(delta: f32, total: u32): void {
    if (this.transform) this.transform.rotation.y += delta * 0.1 * this.spinSpeed;
  }
}

export function createPlanetComponent(): PlanetComponent {
  return new PlanetComponent();
}
