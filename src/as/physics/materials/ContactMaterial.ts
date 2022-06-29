import { PhysicsMaterial } from "./PhysicsMaterial";

export class ContactMaterialOptions {
  constructor(
    public friction: f32 = 0.3,
    public restitution: f32 = 0.3,
    public contactEquationStiffness: f32 = 1e7,
    public contactEquationRelaxation: f32 = 3,
    public frictionEquationStiffness: f32 = 1e7,
    public frictionEquationRelaxation: f32 = 3
  ) {}
}

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
export class ContactMaterial {
  static idCounter: i32 = 0;

  /**
   * Identifier of this material
   * @property {Number} id
   */
  id: i32;

  /**
   * Participating materials
   * @property {Array} materials
   * @todo  Should be .materialA and .materialB instead
   */
  materials: PhysicsMaterial[];

  /**
   * Friction coefficient
   * @property {Number} friction
   */
  friction: f32;

  /**
   * Restitution coefficient
   * @property {Number} restitution
   */
  restitution: f32;

  /**
   * Stiffness of the produced contact equations
   * @property {Number} contactEquationStiffness
   */
  contactEquationStiffness: f32;

  /**
   * Relaxation time of the produced contact equations
   * @property {Number} contactEquationRelaxation
   */
  contactEquationRelaxation: f32;

  /**
   * Stiffness of the produced friction equations
   * @property {Number} frictionEquationStiffness
   */
  frictionEquationStiffness: f32;

  /**
   * Relaxation time of the produced friction equations
   * @property {Number} frictionEquationRelaxation
   */
  frictionEquationRelaxation: f32;

  constructor(
    m1: PhysicsMaterial,
    m2: PhysicsMaterial,
    options: ContactMaterialOptions = new ContactMaterialOptions()
  ) {
    this.id = ContactMaterial.idCounter++;
    this.materials = [m1, m2];
    this.friction = options.friction;
    this.restitution = options.restitution;
    this.contactEquationStiffness = options.contactEquationStiffness;
    this.contactEquationRelaxation = options.contactEquationRelaxation;
    this.frictionEquationStiffness = options.frictionEquationStiffness;
    this.frictionEquationRelaxation = options.frictionEquationRelaxation;
  }
}
