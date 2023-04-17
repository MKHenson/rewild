import { BR_BOUNDING_VOLUME_TREE } from "../../../constants";
import { Shape } from "../../../shape/Shape";
import { BroadPhase } from "../BroadPhase";
import { DBVT } from "./DBVT";
import { DBVTNode } from "./DBVTNode";
import { DBVTProxy } from "./DBVTProxy";

/**
 * A broad-phase algorithm using dynamic bounding volume tree.
 *
 * @author saharan
 * @author lo-th
 */

export class DBVTBroadPhase extends BroadPhase {
  tree: DBVT;
  stack: DBVTNode[];
  leaves: DBVTNode[];
  numLeaves: i32;

  constructor() {
    super();

    this.types = BR_BOUNDING_VOLUME_TREE;

    this.tree = new DBVT();
    this.stack = [];
    this.leaves = [];
    this.numLeaves = 0;
  }

  createProxy(shape: Shape): DBVTProxy {
    return new DBVTProxy(shape);
  }

  addProxy(proxy: DBVTProxy): void {
    this.tree.insertLeaf(proxy.leaf);
    this.leaves.push(proxy.leaf);
    this.numLeaves++;
  }

  removeProxy(proxy: DBVTProxy): void {
    this.tree.deleteLeaf(proxy.leaf);
    const n = this.leaves.indexOf(proxy.leaf);
    if (n > -1) {
      this.leaves.splice(n, 1);
      this.numLeaves--;
    }
  }

  collectPairs(): void {
    if (this.numLeaves < 2) return;

    let leaf: DBVTNode | null,
      margin: f32 = 0.1,
      i: i32 = this.numLeaves;

    while (i--) {
      leaf = this.leaves[i];

      if (leaf.proxy!.aabb.intersectTestTwo(leaf.aabb)) {
        leaf.aabb.copy(leaf.proxy!.aabb, margin);
        this.tree.deleteLeaf(leaf);
        this.tree.insertLeaf(leaf);
        this.collide(leaf, this.tree.root!);
      }
    }
  }

  collide(node1: DBVTNode, node2: DBVTNode): void {
    let stackCount: i32 = 2;
    let s1: Shape, s2: Shape, n1: DBVTNode, n2: DBVTNode, l1: boolean, l2: boolean;
    this.stack[0] = node1;
    this.stack[1] = node2;

    while (stackCount > 0) {
      n1 = this.stack[--stackCount];
      n2 = this.stack[--stackCount];
      l1 = n1.proxy != null;
      l2 = n2.proxy != null;

      this.numPairChecks++;

      if (l1 && l2) {
        s1 = n1.proxy!.shape;
        s2 = n2.proxy!.shape;
        if (s1 == s2 || s1.aabb.intersectTest(s2.aabb) || !this.isAvailablePair(s1, s2)) continue;

        this.addPair(s1, s2);
      } else {
        if (n1.aabb.intersectTest(n2.aabb)) continue;

        /*if(stackCount+4>=this.maxStack){// expand the stack
                    //this.maxStack<<=1;
                    this.maxStack*=2;
                    const newStack = [];// vector
                    newStack.length = this.maxStack;
                    for(const i=0;i<stackCount;i++){
                        newStack[i] = this.stack[i];
                    }
                    this.stack = newStack;
                }*/

        if (l2 || (!l1 && n1.aabb.surfaceArea() > n2.aabb.surfaceArea())) {
          this.stack[stackCount++] = n1.child1!;
          this.stack[stackCount++] = n2;
          this.stack[stackCount++] = n1.child2!;
          this.stack[stackCount++] = n2;
        } else {
          this.stack[stackCount++] = n1;
          this.stack[stackCount++] = n2.child1!;
          this.stack[stackCount++] = n1;
          this.stack[stackCount++] = n2.child2!;
        }
      }
    }
  }
}
