/**
 * @author schteppe
 * @author MathewKHenson
 */

export class PhysicsMaterialOptions {
  constructor(public friction: f32 = -1, public restitution: f32 = -1, public name: string = "") {}
}

export class PhysicsMaterial {
  static idCounter: i32 = 0;

  id: i32;

  // Friction for this material. If non-negative, it will be used instead of the friction given by ContactMaterials. If there's no matching ContactMaterial, the value from .defaultContactMaterial in the World will be used.
  friction: f32;

  // Restitution for this material. If non-negative, it will be used instead of the restitution given by ContactMaterials. If there's no matching ContactMaterial, the value from .defaultContactMaterial in the World will be used.
  restitution: f32;
  name: string;

  constructor(options: PhysicsMaterialOptions | null) {
    this.name = options?.name || "";
    this.id = PhysicsMaterial.idCounter++;

    this.friction = options?.friction || -1;
    this.restitution = options?.restitution || -1;
  }
}
