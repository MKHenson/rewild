import { Shape } from "../../shape/Shape";
import { Proxy, ProxyIdCount } from "./Proxy";

/**
 * A basic implementation of proxies.
 *
 * @author saharan
 */

export class BasicProxy extends Proxy {
  id: i32;
  constructor(shape: Shape) {
    super(shape);

    this.id = ProxyIdCount();
  }

  update() {}
}
