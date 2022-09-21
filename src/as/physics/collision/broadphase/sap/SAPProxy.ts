import { Shape } from "../../../shape/Shape";
import { Proxy } from "../Proxy";
import { SAPBroadPhase } from "./SAPBroadPhase";
import { SAPElement } from "./SAPElement";

/**
 * A proxy for sweep and prune broad-phase.
 * @author saharan
 * @author lo-th
 */

export class SAPProxy extends Proxy {
  // Type of the axis to which the proxy belongs to. [0:none, 1:dynamic, 2:static]
  belongsTo: i32;
  // The maximum elements on each axis.
  max: SAPElement[];
  // The minimum elements on each axis.
  min: SAPElement[];

  sap: SAPBroadPhase;

  constructor(sap: SAPBroadPhase, shape: Shape) {
    super(shape);
    this.belongsTo = 0;
    this.max = [];
    this.min = [];

    this.sap = sap;
    this.min[0] = new SAPElement(this, false);
    this.max[0] = new SAPElement(this, true);
    this.min[1] = new SAPElement(this, false);
    this.max[1] = new SAPElement(this, true);
    this.min[2] = new SAPElement(this, false);
    this.max[2] = new SAPElement(this, true);
    this.max[0].pair = this.min[0];
    this.max[1].pair = this.min[1];
    this.max[2].pair = this.min[2];
    this.min[0].min1 = this.min[1];
    this.min[0].max1 = this.max[1];
    this.min[0].min2 = this.min[2];
    this.min[0].max2 = this.max[2];
    this.min[1].min1 = this.min[0];
    this.min[1].max1 = this.max[0];
    this.min[1].min2 = this.min[2];
    this.min[1].max2 = this.max[2];
    this.min[2].min1 = this.min[0];
    this.min[2].max1 = this.max[0];
    this.min[2].min2 = this.min[1];
    this.min[2].max2 = this.max[1];
  }

  // Returns whether the proxy is dynamic or not.
  isDynamic(): boolean {
    const body = this.shape.parent!;
    return body.isDynamic && !body.sleeping;
  }

  update(): void {
    const te = this.aabb.elements;
    this.min[0].value = te[0];
    this.min[1].value = te[1];
    this.min[2].value = te[2];
    this.max[0].value = te[3];
    this.max[1].value = te[4];
    this.max[2].value = te[5];

    if ((this.belongsTo == 1 && !this.isDynamic()) || (this.belongsTo == 2 && this.isDynamic())) {
      this.sap.removeProxy(this);
      this.sap.addProxy(this);
    }
  }
}
