import { init, wasm } from "../utils/wasm-module";

let nodeCallback = jest.fn();

describe("Level Routing Tests", () => {
  let level: any;
  let container1: any;
  let container2: any;
  let portalExit: any;

  beforeAll(async () => {
    await init({
      nodeCallback,
    });
  });

  it("creates a runtime with a level & containers", () => {
    wasm.init(500, 500);
    level = wasm.createDebugLevel("LevelA", true);
    container1 = wasm.createDebugContainer("ContainerA", true, true);
    container2 = wasm.createDebugContainer("ContainerB", true, true);
    portalExit = wasm.getNodePortal(container2, "Exit");
    wasm.addChildNode(level, container1);
    wasm.addChildNode(level, container2);
    wasm.addNodeToRuntime(level, true);

    expect(nodeCallback).toHaveBeenNthCalledWith(
      1,
      "LevelA",
      "addChild",
      "ContainerA"
    );

    expect(nodeCallback).toHaveBeenNthCalledWith(
      2,
      "LevelA",
      "addChild",
      "ContainerB"
    );
  });

  it("has mounted the level and activated the containers", () => {
    nodeCallback.mockClear();
    wasm.update(1, 1);
    expect(nodeCallback).toHaveBeenNthCalledWith(1, "LevelA", "mount", "");

    expect(nodeCallback).toHaveBeenNthCalledWith(
      2,
      "ContainerA",
      "enter",
      "Enter"
    );
    expect(nodeCallback).toHaveBeenNthCalledWith(
      3,
      "ContainerB",
      "enter",
      "Enter"
    );
    expect(nodeCallback).toHaveBeenNthCalledWith(4, "LevelA", "onUpdate", "");
    expect(wasm.getActiveNodeCount()).toBe(3);
  });

  it("calls exit on the second container and completely exits all containers and levels", () => {
    nodeCallback.mockClear();
    wasm.sendSignal(portalExit, true);
    wasm.update(1, 1);

    expect(nodeCallback).toHaveBeenNthCalledWith(1, "LevelA", "enter", "Exit");
    expect(nodeCallback).toHaveBeenNthCalledWith(
      2,
      "ContainerB",
      "unMount",
      ""
    );
    expect(nodeCallback).toHaveBeenNthCalledWith(
      3,
      "ContainerA",
      "unMount",
      ""
    );
    expect(nodeCallback).toHaveBeenNthCalledWith(4, "LevelA", "unMount", "");
  });

  it("should not have any active nodes now", () => {
    expect(wasm.getActiveNodeCount()).toBe(0);
  });
});
