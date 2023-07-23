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
    debugNode = wasm.createDebugNode("Test");
    const link = wasm.createLink();
    const portalEnter = wasm.createPortal("Enter");
    portalExit = wasm.createPortal("Exit");
    wasm.addNodePortal(debugNode, portalEnter);
    wasm.addNodePortal(debugNode, portalExit);
    wasm.connectLink(link, portalEnter, portalExit);
    wasm.addNodeToRuntime(debugNode, true);
  });

  it("has not called any functions yet", () => {
    expect(nodeCallback).not.toHaveBeenCalled();
  });

  it("has mounted the debug node & called update once", () => {
    wasm.update(1, 1);
    expect(nodeCallback).toHaveBeenCalledTimes(2);
    expect(nodeCallback).toHaveBeenNthCalledWith(1, "Test", "mount", "");
    expect(nodeCallback).toHaveBeenNthCalledWith(2, "Test", "onUpdate", "");
  });

  it("calls exitNode and subsequently exit on the debug node", () => {
    wasm.exitNode(debugNode, portalExit, true);
    expect(nodeCallback).toHaveBeenCalledTimes(3);
    expect(nodeCallback).toHaveBeenNthCalledWith(3, "Test", "exit", "Exit");
  });

  it("unmounts the node on the next update", () => {
    wasm.update(1, 1);
    expect(nodeCallback).toHaveBeenCalledTimes(4);
    expect(nodeCallback).toHaveBeenNthCalledWith(4, "Test", "unMount", "");
  });
});
