import { Material } from '../material/Material';

/**
 * Defines what happens when two materials meet.
 * @todo Refactor materials to materialA and materialB
 */
export class ContactMaterial {
  /**
   * Identifier of this material.
   */
  id: i32;
  /**
   * Participating materials.
   */
  materials: Material[];
  /**
   * Friction coefficient.
   * @default 0.3
   */
  friction: f32;
  /**
   * Restitution coefficient.
   * @default 0.3
   */
  restitution: f32;
  /**
   * Stiffness of the produced contact equations.
   * @default 1e7
   */
  contactEquationStiffness: f32;
  /**
   * Relaxation time of the produced contact equations.
   * @default 3
   */
  contactEquationRelaxation: f32;
  /**
   * Stiffness of the produced friction equations.
   * @default 1e7
   */
  frictionEquationStiffness: f32;
  /**
   * Relaxation time of the produced friction equations
   * @default 3
   */
  frictionEquationRelaxation: f32;

  static idCounter: i32 = 0;

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
    this.id = ContactMaterial.idCounter++;
    this.materials = [m1, m2];
    this.friction = friction;
    this.restitution = restitution;
    this.contactEquationStiffness = contactEquationStiffness;
    this.contactEquationRelaxation = contactEquationRelaxation;
    this.frictionEquationStiffness = frictionEquationStiffness;
    this.frictionEquationRelaxation = frictionEquationRelaxation;
  }
}
