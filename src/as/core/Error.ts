import { BridgeManager } from "../core/BridgeManager";

export class ASError extends Error {
  constructor(message: string) {
    super(message);
    BridgeManager.getBridge().print(`Error: ${message}`);
  }
}
