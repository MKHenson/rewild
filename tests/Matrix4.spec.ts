import expect = require("expect.js");
import { wasm } from "./wasm-module";

describe("Matrix4", () => {
  it("multiplies another Matrix4", () => {
    const lhs = wasm.Matrix4.wrap(wasm.newMatrix4());
    const rhs = wasm.Matrix4.wrap(wasm.newMatrix4());

    lhs.set(2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53);
    rhs.set(59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131);

    lhs.multiply(rhs.valueOf());
    const elements = wasm.__getFloat32Array(lhs.elements);
    expect(elements[0]).to.equal(1585);
    expect(elements[1]).to.equal(5318);
    expect(elements[2]).to.equal(10514);
    expect(elements[3]).to.equal(15894);
    expect(elements[4]).to.equal(1655);
    expect(elements[5]).to.equal(5562);
    expect(elements[6]).to.equal(11006);
    expect(elements[7]).to.equal(16634);
    expect(elements[8]).to.equal(1787);
    expect(elements[9]).to.equal(5980);
    expect(elements[10]).to.equal(11840);
    expect(elements[11]).to.equal(17888);
    expect(elements[12]).to.equal(1861);
    expect(elements[13]).to.equal(6246);
    expect(elements[14]).to.equal(12378);
    expect(elements[15]).to.equal(18710);
  });
});
