import { init, wasm } from "./utils/wasm-module";

describe("TransformNode", () => {
  let node: any;
  let array: Int32Array;

  beforeAll(async () => {
    await init();
  });

  it("creates a transform node & live view of data properties", () => {
    node = wasm.createTransformNode("test");
    array = wasm.getLiveI32Array(wasm.getDataProperties(node));
  });

  it("has the correct length of data properties", () => {
    expect(array.length).toBe(7);
  });

  it("has the correct defaults", () => {
    expect(wasm.getCastShadow(node)).toBe(false);
    expect(wasm.getFrustumCulled(node)).toBe(true);
    expect(wasm.getId(node)).toBe(0);
    expect(wasm.getMatrixAutoUpdate(node)).toBe(true);
    expect(wasm.getReceiveShadow(node)).toBe(false);
    expect(wasm.getRenderOrder(node)).toBe(0);
    expect(wasm.getVisible(node)).toBe(true);
  });

  it("changes cast shadow dynamically", () => {
    expect(wasm.getCastShadow(node)).toBe(false);
    expect(array[4]).toBe(0);

    array[4] = 1;
    expect(wasm.getCastShadow(node)).toBe(true);
  });

  it("changes frustum culled dynamically", () => {
    expect(wasm.getFrustumCulled(node)).toBe(true);
    expect(array[2]).toBe(1);

    array[2] = 0;
    expect(wasm.getFrustumCulled(node)).toBe(false);
  });

  it("changes id dynamically", () => {
    expect(wasm.getId(node)).toBe(0);
    expect(array[6]).toBe(0);

    array[6] = 10023;
    expect(wasm.getId(node)).toBe(10023);
  });

  it("changes matrix auto update culled dynamically", () => {
    expect(wasm.getMatrixAutoUpdate(node)).toBe(true);
    expect(array[3]).toBe(1);

    array[3] = 0;
    expect(wasm.getMatrixAutoUpdate(node)).toBe(false);
  });

  it("changes receive shadow dynamically", () => {
    expect(wasm.getReceiveShadow(node)).toBe(false);
    expect(array[5]).toBe(0);

    array[5] = 1;
    expect(wasm.getReceiveShadow(node)).toBe(true);
  });

  it("changes render order dynamically", () => {
    expect(wasm.getRenderOrder(node)).toBe(0);
    expect(array[1]).toBe(0);

    array[1] = 56;
    expect(wasm.getRenderOrder(node)).toBe(56);
  });

  it("changes visibility dynamically", () => {
    expect(wasm.getVisible(node)).toBe(true);
    expect(array[0]).toBe(1);

    array[0] = 0;
    expect(wasm.getVisible(node)).toBe(false);
  });
});
