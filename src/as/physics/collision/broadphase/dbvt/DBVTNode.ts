import { AABB } from "../../../math/AABB";
import { Proxy } from "../Proxy";

/**
 * A node of the dynamic bounding volume tree.
 * @author saharan
 */

export class DBVTNode {
  // The first child node of this node.
  child1: DBVTNode | null;
  // The second child node of this node.
  child2: DBVTNode | null;
  //  The parent node of this tree.
  parent: DBVTNode | null;
  // The proxy of this node. This has no value if this node is not leaf.
  proxy: Proxy | null;
  // The maximum distance from leaf nodes.
  height: i32;
  // The AABB of this node.
  aabb: AABB;

  constructor() {
    this.child1 = null;
    this.child2 = null;
    this.parent = null;
    this.proxy = null;
    this.height = 0;
    this.aabb = new AABB();
  }
}
