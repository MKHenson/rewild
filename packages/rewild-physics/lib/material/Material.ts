/**
 * Defines a physics material.
 */
export class Material {
  /**
   * Material name.
   * If options is a string, name will be set to that string.
   * @todo Deprecate this
   */
  name: string;
  /** Material id. */
  id: i32;
  /**
   * Friction for this material.
   * If non-negative, it will be used instead of the friction given by ContactMaterials. If there's no matching ContactMaterial, the value from `defaultContactMaterial` in the World will be used.
   */
  friction: f32;
  /**
   * Restitution for this material.
   * If non-negative, it will be used instead of the restitution given by ContactMaterials. If there's no matching ContactMaterial, the value from `defaultContactMaterial` in the World will be used.
   */
  restitution: f32;

  static idCounter: i32 = 0;

  constructor(name: string = '', friction: f32 = -1, restitution: f32 = -1) {
    this.name = name;
    this.id = Material.idCounter++;
    this.friction = friction;
    this.restitution = restitution;
  }
}
