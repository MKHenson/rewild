import { init } from "./wasm-module";

module.exports = async () => {
  await init();
};

// describe("Startup", () => {
//   it("downloads the wasm file", async () => {
//     await init();
//   });
// });
