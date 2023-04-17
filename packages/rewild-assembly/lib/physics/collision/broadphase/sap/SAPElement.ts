/**
 * An element of proxies.
 * @author saharan
 */

import { Proxy } from "../Proxy";

export class SAPElement {
  // The parent proxy
  proxy: Proxy;
  // The pair element.
  pair: SAPElement | null;
  // The minimum element on other axis.
  min1: SAPElement | null;
  // The maximum element on other axis.
  max1: SAPElement | null;
  // The minimum element on other axis.
  min2: SAPElement | null;
  // The maximum element on other axis.
  max2: SAPElement | null;
  // Whether the element has maximum value or not.
  max: boolean;
  // The value of the element.
  value: f32;

  constructor(proxy: Proxy, max: boolean) {
    // The parent proxy
    this.proxy = proxy;
    // The pair element.
    this.pair = null;
    // The minimum element on other axis.
    this.min1 = null;
    // The maximum element on other axis.
    this.max1 = null;
    // The minimum element on other axis.
    this.min2 = null;
    // The maximum element on other axis.
    this.max2 = null;
    // Whether the element has maximum value or not.
    this.max = max;
    // The value of the element.
    this.value = 0;
  }
}
