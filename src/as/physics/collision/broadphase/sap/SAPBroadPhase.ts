import { BR_SWEEP_AND_PRUNE } from "../../../constants";
import { Shape } from "../../../shape/Shape";
import { BroadPhase } from "../BroadPhase";
import { Proxy } from "../Proxy";
import { SAPAxis } from "./SAPAxis";
import { SAPElement } from "./SAPElement";
import { SAPProxy } from "./SAPProxy";

/**
 * A broad-phase collision detection algorithm using sweep and prune.
 * @author saharan
 * @author lo-th
 */

export class SAPBroadPhase extends BroadPhase {
  numElementsD: i32;
  numElementsS: i32;
  index1: i32;
  index2: i32;
  axesD: SAPAxis[];
  axesS: SAPAxis[];

  constructor() {
    super();
    this.types = BR_SWEEP_AND_PRUNE;

    this.numElementsD = 0;
    this.numElementsS = 0;
    // dynamic proxies
    this.axesD = [new SAPAxis(), new SAPAxis(), new SAPAxis()];
    // static or sleeping proxies
    this.axesS = [new SAPAxis(), new SAPAxis(), new SAPAxis()];

    this.index1 = 0;
    this.index2 = 1;
  }

  createProxy(shape: Shape): SAPProxy {
    return new SAPProxy(this, shape);
  }

  addProxy(proxy: SAPProxy): void {
    const p = proxy;
    if (p.isDynamic()) {
      this.axesD[0].addElements(p.min[0], p.max[0]);
      this.axesD[1].addElements(p.min[1], p.max[1]);
      this.axesD[2].addElements(p.min[2], p.max[2]);
      p.belongsTo = 1;
      this.numElementsD += 2;
    } else {
      this.axesS[0].addElements(p.min[0], p.max[0]);
      this.axesS[1].addElements(p.min[1], p.max[1]);
      this.axesS[2].addElements(p.min[2], p.max[2]);
      p.belongsTo = 2;
      this.numElementsS += 2;
    }
  }

  removeProxy(proxy: SAPProxy): void {
    const p = proxy;
    if (p.belongsTo == 0) return;

    /*else if ( p.belongsTo == 1 ) {
            this.axesD[0].removeElements( p.min[0], p.max[0] );
            this.axesD[1].removeElements( p.min[1], p.max[1] );
            this.axesD[2].removeElements( p.min[2], p.max[2] );
            this.numElementsD -= 2;
        } else if ( p.belongsTo == 2 ) {
            this.axesS[0].removeElements( p.min[0], p.max[0] );
            this.axesS[1].removeElements( p.min[1], p.max[1] );
            this.axesS[2].removeElements( p.min[2], p.max[2] );
            this.numElementsS -= 2;
        }*/

    switch (p.belongsTo) {
      case 1:
        this.axesD[0].removeElements(p.min[0], p.max[0]);
        this.axesD[1].removeElements(p.min[1], p.max[1]);
        this.axesD[2].removeElements(p.min[2], p.max[2]);
        this.numElementsD -= 2;
        break;
      case 2:
        this.axesS[0].removeElements(p.min[0], p.max[0]);
        this.axesS[1].removeElements(p.min[1], p.max[1]);
        this.axesS[2].removeElements(p.min[2], p.max[2]);
        this.numElementsS -= 2;
        break;
    }

    p.belongsTo = 0;
  }

  collectPairs(): void {
    if (this.numElementsD == 0) return;

    let axis1 = this.axesD[this.index1];
    let axis2 = this.axesD[this.index2];

    axis1.sort();
    axis2.sort();

    const count1 = axis1.calculateTestCount();
    const count2 = axis2.calculateTestCount();
    let elementsD: (SAPElement | null)[];
    let elementsS: (SAPElement | null)[];

    if (count1 <= count2) {
      // select the best axis
      axis2 = this.axesS[this.index1];
      axis2.sort();
      elementsD = axis1.elements;
      elementsS = axis2.elements;
    } else {
      axis1 = this.axesS[this.index2];
      axis1.sort();
      elementsD = axis2.elements;
      elementsS = axis1.elements;
      this.index1 ^= this.index2;
      this.index2 ^= this.index1;
      this.index1 ^= this.index2;
    }
    let activeD!: SAPElement | null;
    let activeS!: SAPElement | null;
    let p: i32 = 0;
    let q: i32 = 0;
    while (p < this.numElementsD) {
      let e1: SAPElement | null;
      let dyn: boolean;

      if (q == this.numElementsS) {
        e1 = elementsD[p]!;
        dyn = true;
        p++;
      } else {
        const d = elementsD[p]!;
        const s = elementsS[q]!;
        if (d.value < s.value) {
          e1 = d;
          dyn = true;
          p++;
        } else {
          e1 = s;
          dyn = false;
          q++;
        }
      }
      if (!e1.max) {
        const s1 = e1.proxy.shape;
        let s2: Shape;
        const min1 = e1.min1!.value;
        const max1 = e1.max1!.value;
        const min2 = e1.min2!.value;
        const max2 = e1.max2!.value;

        for (let e2: SAPElement | null = activeD!; e2 != null; e2 = e2!.pair) {
          // test for dynamic
          const s2 = e2.proxy.shape;

          this.numPairChecks++;
          if (
            min1 > e2.max1!.value ||
            max1 < e2.min1!.value ||
            min2 > e2.max2!.value ||
            max2 < e2.min2!.value ||
            !this.isAvailablePair(s1, s2)
          )
            continue;
          this.addPair(s1, s2);
        }
        if (dyn) {
          for (let e2: SAPElement | null = activeS!; e2 != null; e2 = e2!.pair) {
            // test for static
            s2 = e2.proxy.shape;

            this.numPairChecks++;

            if (
              min1 > e2.max1!.value ||
              max1 < e2.min1!.value ||
              min2 > e2.max2!.value ||
              max2 < e2.min2!.value ||
              !this.isAvailablePair(s1, s2)
            )
              continue;
            this.addPair(s1, s2);
          }
          e1.pair = activeD;
          activeD = e1;
        } else {
          e1.pair = activeS;
          activeS = e1;
        }
      } else {
        const min = e1.pair;
        let e2: SAPElement | null;

        if (dyn) {
          if (min == activeD) {
            activeD = activeD!.pair;
            continue;
          } else {
            e1 = activeD;
          }
        } else {
          if (min == activeS) {
            activeS = activeS!.pair;
            continue;
          } else {
            e1 = activeS;
          }
        }
        while (e1) {
          e2 = e1.pair;
          if (e2 == min) {
            e1.pair = e2!.pair;
            break;
          }
          e1 = e2;
        }
      }
    }
    this.index2 = (this.index1 | this.index2) ^ 3;
  }
}
