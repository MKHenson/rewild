import { wasm } from "./wasm-module";
import expect from "expect.js";

describe("TransformNode", () => {
  let node: any;
  let array: Int32Array;

  it("creates a transform node & live view of data properties", () => {
    node = wasm.createTransformNode();
    array = wasm.getLiveI32Array(wasm.getDataProperties(node));
  });

  it("has the correct length of data properties", () => {
    expect(array.length).to.equal(7);
  });

  it("has the correct defaults", () => {
    expect(wasm.getCastShadow(node)).to.equal(false);
    expect(wasm.getFrustumCulled(node)).to.equal(true);
    expect(wasm.getId(node)).to.equal(0);
    expect(wasm.getMatrixAutoUpdate(node)).to.equal(true);
    expect(wasm.getReceiveShadow(node)).to.equal(false);
    expect(wasm.getRenderOrder(node)).to.equal(0);
    expect(wasm.getVisible(node)).to.equal(true);
  });

  it("changes cast shadow dynamically", () => {
    expect(wasm.getCastShadow(node)).to.equal(false);
    expect(array[4]).to.equal(0);

    array[4] = 1;
    expect(wasm.getCastShadow(node)).to.equal(true);
  });

  it("changes frustum culled dynamically", () => {
    expect(wasm.getFrustumCulled(node)).to.equal(true);
    expect(array[2]).to.equal(1);

    array[2] = 0;
    expect(wasm.getFrustumCulled(node)).to.equal(false);
  });

  it("changes id dynamically", () => {
    expect(wasm.getId(node)).to.equal(0);
    expect(array[6]).to.equal(0);

    array[6] = 10023;
    expect(wasm.getId(node)).to.equal(10023);
  });

  it("changes matrix auto update culled dynamically", () => {
    expect(wasm.getMatrixAutoUpdate(node)).to.equal(true);
    expect(array[3]).to.equal(1);

    array[3] = 0;
    expect(wasm.getMatrixAutoUpdate(node)).to.equal(false);
  });

  it("changes receive shadow dynamically", () => {
    expect(wasm.getReceiveShadow(node)).to.equal(false);
    expect(array[5]).to.equal(0);

    array[5] = 1;
    expect(wasm.getReceiveShadow(node)).to.equal(true);
  });

  it("changes render order dynamically", () => {
    expect(wasm.getRenderOrder(node)).to.equal(0);
    expect(array[1]).to.equal(0);

    array[1] = 56;
    expect(wasm.getRenderOrder(node)).to.equal(56);
  });

  it("changes visibility dynamically", () => {
    expect(wasm.getVisible(node)).to.equal(true);
    expect(array[0]).to.equal(1);

    array[0] = 0;
    expect(wasm.getVisible(node)).to.equal(false);
  });
});
