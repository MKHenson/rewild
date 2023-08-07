import { init, wasm } from "../utils/wasm-module";

let nodeCallback = jest.fn();
let transformCallback = jest.fn();
let componentCallback = jest.fn();

describe("Container Routing Tests", () => {
  let container: any;
  let portalExit: any;
  let transform: any;
  let transformComponent: any;

  beforeAll(async () => {
    await init({
      nodeCallback,
      transformCallback,
      componentCallback,
    });
  });

  it("creates a runtime with a single container & its assets", () => {
    wasm.init(500, 500);
    container = wasm.createDebugContainer("ContainerA", true, true);
    portalExit = wasm.getNodePortal(container, "Exit");
    transform = wasm.createDebugTransform("TransformA");
    transformComponent = wasm.createDebugComponent("TransformComponentA");
    wasm.addAsset(container, transform);
    wasm.addComponent(transform, transformComponent);
    wasm.addNodeToRuntime(container, true);

    expect(nodeCallback).toHaveBeenNthCalledWith(
      1,
      "ContainerA",
      "addAsset",
      "TransformA"
    );
  });

  it("has mounted the container & added its assets", () => {
    nodeCallback.mockClear();

    wasm.update(1, 1);

    expect(wasm.getActiveNodeCount()).toBe(1);
    expect(nodeCallback).toHaveBeenNthCalledWith(1, "ContainerA", "mount", "");
    expect(nodeCallback).toHaveBeenNthCalledWith(
      2,
      "ContainerA",
      "onUpdate",
      ""
    );
  });

  it("has added the asset to the scene graph", () => {
    expect(transformCallback).toHaveBeenCalled();
    expect(transformCallback).toHaveBeenCalledWith(
      "TransformA",
      "onAddedToParent",
      ""
    );
  });

  it("has called the mount function on the asset component", () => {
    expect(componentCallback).toHaveBeenCalled();
    expect(componentCallback).toHaveBeenCalledWith(
      "TransformComponentA",
      "mount",
      ""
    );
  });

  it("calls the component function to update", () => {
    componentCallback.mockClear();
    wasm.update(1, 1);
    expect(componentCallback).toHaveBeenCalled();
    expect(componentCallback).toHaveBeenCalledWith(
      "TransformComponentA",
      "onUpdate",
      ""
    );
  });

  it("unmounts the node on the next update", () => {
    transformCallback.mockClear();
    componentCallback.mockClear();

    wasm.sendSignal(portalExit, true);
    wasm.update(1, 1);
    expect(nodeCallback).toHaveBeenCalledTimes(4);
    expect(nodeCallback).toHaveBeenNthCalledWith(
      4,
      "ContainerA",
      "unMount",
      ""
    );
    expect(wasm.getActiveNodeCount()).toBe(0);
    expect(wasm.getNodeCount()).toBe(0);
  });

  it("removes the asset from the scene graph", () => {
    expect(transformCallback).toHaveBeenCalled();
    expect(transformCallback).toHaveBeenCalledWith(
      "TransformA",
      "onRemovedFromParent",
      ""
    );
  });

  it("calls unmount on the component", () => {
    expect(componentCallback).toHaveBeenCalled();
    expect(componentCallback).toHaveBeenCalledWith(
      "TransformComponentA",
      "unMount",
      ""
    );
  });
});
