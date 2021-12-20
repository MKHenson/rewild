import * as assert from "assert";
import { wasm } from "./wasm-module";

describe("Check we can load a module and run its exports", () => {
  it("can add", () => {
    assert.strictEqual(wasm.add(1, 2), 3);
  });

  it("can multiply", () => {
    assert.strictEqual(wasm.mul(1, 2), 2);
  });
});
