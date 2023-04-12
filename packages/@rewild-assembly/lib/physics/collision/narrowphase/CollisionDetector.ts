import { ContactManifold } from "../../constraint/contact/ContactManifold";
import { Shape } from "../../shape/Shape";

export abstract class CollisionDetector {
  flip: boolean;

  constructor() {
    this.flip = false;
  }

  abstract detectCollision(shape1: Shape, shape2: Shape, manifold: ContactManifold): void;
}
