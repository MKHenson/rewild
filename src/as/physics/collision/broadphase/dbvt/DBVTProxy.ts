import { Shape } from "../../../shape/Shape";
import { Proxy } from "../Proxy";
import { DBVTNode } from "./DBVTNode";

/**
 * A proxy for dynamic bounding volume tree broad-phase.
 * @author saharan
 */

export class DBVTProxy extends Proxy {
  leaf: DBVTNode;

  constructor(shape: Shape) {
    super(shape);
    // The leaf of the proxy.
    this.leaf = new DBVTNode();
    this.leaf.proxy = this;
  }
  update() {}
}
