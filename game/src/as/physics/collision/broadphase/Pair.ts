import { Shape } from "../../shape/Shape";

/**
 * A pair of shapes that may collide.
 * @author saharan
 */
export class Pair {
  constructor(public shape1: Shape | null = null, public shape2: Shape | null = null) {}
}
