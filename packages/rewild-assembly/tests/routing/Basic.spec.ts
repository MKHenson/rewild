import { init, wasm } from "../utils/wasm-module";

let nodeCallback = jest.fn();

describe("Basic Routing", () => {
  let debugNode: any;
  let portalExit: any;

  beforeAll(async () => {
    await init({
      nodeCallback,
    });
  });

  it("creates a runtime with a single debug node", () => {
    wasm.init(500, 500);
    debugNode = wasm.createDebugNode("Test", true);
    const link = wasm.createLink();
    const portalEnter = wasm.createPortal("Enter");
    portalExit = wasm.createPortal("Exit");
    wasm.addNodePortal(debugNode, portalEnter);
    wasm.addNodePortal(debugNode, portalExit);
    wasm.connectLink(link, portalEnter, portalExit);
    wasm.addNodeToRuntime(debugNode, true);
  });

  it("has not called any functions yet", () => {
    expect(wasm.getActiveNodeCount()).toBe(1);
    expect(wasm.getNodeCount()).toBe(1);
    expect(nodeCallback).not.toHaveBeenCalled();
  });

  it("has mounted the debug node & called update once", () => {
    wasm.update(1, 1);
    expect(wasm.getActiveNodeCount()).toBe(1);
    expect(nodeCallback).toHaveBeenCalledTimes(2);
    expect(nodeCallback).toHaveBeenNthCalledWith(1, "Test", "mount", "");
    expect(nodeCallback).toHaveBeenNthCalledWith(2, "Test", "onUpdate", "");
  });

  it("unmounts the node on the next update", () => {
    wasm.sendSignal(portalExit, true);
    wasm.update(1, 1);
    expect(nodeCallback).toHaveBeenCalledTimes(3);
    expect(nodeCallback).toHaveBeenNthCalledWith(3, "Test", "unMount", "");
    expect(wasm.getActiveNodeCount()).toBe(0);
    expect(wasm.getNodeCount()).toBe(0);
  });
});
