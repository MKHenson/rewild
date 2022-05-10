import { init } from "./wasm-module";

describe("Startup", () => {
  it("downloads the wasm file", async () => {
    await init();
  });
});
