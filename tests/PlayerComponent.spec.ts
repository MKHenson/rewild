import { wasm } from "./wasm-module";
import expect from "expect.js";

describe("PlayerComponent", () => {
  let player: any;
  let array: Int32Array;

  it("creates a transform node & live view of data properties", () => {
    player = wasm.createPlayerComponent();
    array = wasm.getLiveI32Array(wasm.getPlayerComponentProperties(player));
  });

  it("has the correct length of data properties", () => {
    expect(array.length).to.equal(3);
  });

  it("has the correct defaults", () => {
    expect(wasm.getPlayerIsDead(player)).to.equal(false);
    expect(wasm.getPlayerHealth(player)).to.equal(100);
    expect(wasm.getPlayerHunger(player)).to.equal(100);
  });

  it("changes health dynamically", () => {
    expect(wasm.getPlayerHealth(player)).to.equal(100);
    expect(array[0]).to.equal(100);

    array[0] = 21;
    expect(wasm.getPlayerHealth(player)).to.equal(21);
  });

  it("changes player death dynamically", () => {
    expect(wasm.getPlayerIsDead(player)).to.equal(false);
    expect(array[1]).to.equal(0);

    array[1] = 1;
    expect(wasm.getPlayerIsDead(player)).to.equal(true);
  });

  it("changes player hunger dynamically", () => {
    expect(wasm.getPlayerHunger(player)).to.equal(100);
    expect(array[2]).to.equal(100);

    array[2] = 1;
    expect(wasm.getPlayerHunger(player)).to.equal(1);
  });
});
