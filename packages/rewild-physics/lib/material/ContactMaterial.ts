import { Material } from "./Material";

export class ContactMaterial {
  id: i32;
  materials: Material[];
  friction: f32;
  restitution: f32;
  contactEquationStiffness: f32;
  contactEquationRelaxation: f32;
  frictionEquationStiffness: f32;
  frictionEquationRelaxation: f32;

  /**
   * Defines what happens when two materials meet.
   * @class ContactMaterial
   * @constructor
   * @param {Material} m1
   * @param {Material} m2
   * @param {object} [options]
   * @param {Number} [options.friction=0.3]
   * @param {Number} [options.restitution=0.3]
   * @param {number} [options.contactEquationStiffness=1e7]
   * @param {number} [options.contactEquationRelaxation=3]
   * @param {number} [options.frictionEquationStiffness=1e7]
   * @param {Number} [options.frictionEquationRelaxation=3]
   */
  constructor(
    m1: Material,
    m2: Material,
    friction: f32 = 0.3,
    restitution: f32 = 0.3,
    contactEquationStiffness: f32 = 1e7,
    contactEquationRelaxation: f32 = 3,
    frictionEquationStiffness: f32 = 1e7,
    frictionEquationRelaxation: f32 = 3
  ) {
    /**
     * Identifier of this material
     * @property {Number} id
     */
    this.id = ContactMaterial.idCounter++;

    /**
     * Participating materials
     * @property {Array} materials
     * @todo  Should be .materialA and .materialB instead
     */
    this.materials = [m1, m2];

    /**
     * Friction coefficient
     * @property {Number} friction
     */
    this.friction = friction;

    /**
     * Restitution coefficient
     * @property {Number} restitution
     */
    this.restitution = restitution;

    /**
     * Stiffness of the produced contact equations
     * @property {Number} contactEquationStiffness
     */
    this.contactEquationStiffness = contactEquationStiffness;

    /**
     * Relaxation time of the produced contact equations
     * @property {Number} contactEquationRelaxation
     */
    this.contactEquationRelaxation = contactEquationRelaxation;

    /**
     * Stiffness of the produced friction equations
     * @property {Number} frictionEquationStiffness
     */
    this.frictionEquationStiffness = frictionEquationStiffness;

    /**
     * Relaxation time of the produced friction equations
     * @property {Number} frictionEquationRelaxation
     */
    this.frictionEquationRelaxation = frictionEquationRelaxation;
  }

  static idCounter: i32 = 0;
}
