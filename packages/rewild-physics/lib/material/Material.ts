export class Material {
  name: string;
  id: i32;
  friction: f32;
  restitution: f32;

  /**
   * Defines a physics material.
   * @class Material
   * @constructor
   * @param {object} [options]
   * @author schteppe
   */
  constructor(name: string = '', friction: f32 = -1, restitution: f32 = -1) {
    /**
     * @property name
     * @type {String}
     */
    this.name = name;

    /**
     * material id.
     * @property id
     * @type {number}
     */
    this.id = Material.idCounter++;

    /**
     * Friction for this material. If non-negative, it will be used instead of the friction given by ContactMaterials. If there's no matching ContactMaterial, the value from .defaultContactMaterial in the World will be used.
     * @property {number} friction
     */
    this.friction = friction;

    /**
     * Restitution for this material. If non-negative, it will be used instead of the restitution given by ContactMaterials. If there's no matching ContactMaterial, the value from .defaultContactMaterial in the World will be used.
     * @property {number} restitution
     */
    this.restitution = restitution;
  }

  static idCounter: i32 = 0;
}
