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

    expect(transformCallback).toHaveBeenCalled();
    expect(transformCallback).toHaveBeenCalledWith(
      "TransformA",
      "onAddedToParent",
      ""
    );

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

  // onUpdate(delta: f32, total: u32): void {
  //   super.onUpdate(delta, total);
  //   componentCallback(this.name!, "onUpdate", "");
  // }

  // mount(runtime: Runtime): void {
  //   super.mount(runtime);
  //   componentCallback(this.name!, "mount", "");
  // }

  // unMount(runtime: Runtime): void {
  //   super.unMount(runtime);
  //   componentCallback(this.name!, "unMount", "");
  // }

  it("calls exitNode and subsequently exit on the container & removes assets", () => {
    wasm.exitNode(container, portalExit, true);
    expect(nodeCallback).toHaveBeenCalledTimes(4);
    expect(nodeCallback).toHaveBeenNthCalledWith(
      4,
      "ContainerA",
      "exit",
      "Exit"
    );
  });

  it("unmounts the node on the next update", () => {
    transformCallback.mockClear();
    componentCallback.mockClear();

    wasm.update(1, 1);
    expect(nodeCallback).toHaveBeenCalledTimes(5);
    expect(nodeCallback).toHaveBeenNthCalledWith(
      5,
      "ContainerA",
      "unMount",
      ""
    );
    expect(wasm.getActiveNodeCount()).toBe(0);
    expect(wasm.getNodeCount()).toBe(0);

    expect(transformCallback).toHaveBeenCalled();
    expect(transformCallback).toHaveBeenCalledWith(
      "TransformA",
      "onRemovedFromParent",
      ""
    );

    expect(componentCallback).toHaveBeenCalled();
    expect(componentCallback).toHaveBeenCalledWith(
      "TransformComponentA",
      "unMount",
      ""
    );
  });
});
