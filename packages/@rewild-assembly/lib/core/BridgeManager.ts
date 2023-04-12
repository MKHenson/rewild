import { IBridge } from "@rewild/Common";

export class BridgeManager {
  static manager: BridgeManager | null;
  bridge: IBridge;

  constructor(bridge: IBridge) {
    this.bridge = bridge;
  }

  static init(bridge: IBridge): BridgeManager {
    BridgeManager.manager = new BridgeManager(bridge);
    return BridgeManager.manager!;
  }

  static getBridge(): IBridge {
    return BridgeManager.manager!.bridge;
  }
}
