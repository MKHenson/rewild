import { BR_NULL } from "../../constants";
import { JointLink } from "../../constraint/joint/JointLink";
import { Shape } from "../../shape/Shape";
import { Pair } from "./Pair";
import { Proxy } from "./Proxy";

/**
 * The broad-phase is used for collecting all possible pairs for collision.
 */

export abstract class BroadPhase {
  types: i32;
  numPairChecks: i32;
  numPairs: i32;
  pairs: Pair[];

  constructor() {
    this.types = BR_NULL;
    this.numPairChecks = 0;
    this.numPairs = 0;
    this.pairs = [];
  }

  // Create a new proxy.
  abstract createProxy(shape: Shape): Proxy;

  // Add the proxy into the broad-phase.
  abstract addProxy(proxy: Proxy): void;

  // Remove the proxy from the broad-phase.
  abstract removeProxy(proxy: Proxy): void;

  // Returns whether the pair is available or not.
  isAvailablePair(s1: Shape, s2: Shape): boolean {
    const b1 = s1.parent!;
    const b2 = s2.parent!;
    if (
      b1 == b2 || // same parents
      (!b1.isDynamic && !b2.isDynamic) || // static or kinematic object
      (s1.belongsTo & s2.collidesWith) == 0 ||
      (s2.belongsTo & s1.collidesWith) == 0 // collision filtering
    ) {
      return false;
    }
    let js: JointLink | null;
    if (b1.numJoints < b2.numJoints) js = b1.jointLink;
    else js = b2.jointLink;
    while (js !== null) {
      const joint = js.joint;
      if (
        !joint.allowCollision &&
        ((joint.body1 == b1 && joint.body2 == b2) || (joint.body1 == b2 && joint.body2 == b1))
      ) {
        return false;
      }
      js = js.next;
    }

    return true;
  }

  // Detect overlapping pairs.
  detectPairs(): void {
    // clear old
    this.pairs = [];
    this.numPairs = 0;
    this.numPairChecks = 0;
    this.collectPairs();
  }

  abstract collectPairs(): void;

  addPair(s1: Shape, s2: Shape): void {
    const pair = new Pair(s1, s2);
    this.pairs.push(pair);
    this.numPairs++;
  }
}
