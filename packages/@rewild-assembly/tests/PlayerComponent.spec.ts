import { init, wasm } from "./utils/wasm-module";

describe("PlayerComponent", () => {
  let player: any;
  let array: Int32Array;

  beforeAll(async () => {
    await init();
  });

  it("creates a transform node & live view of data properties", () => {
    player = wasm.createPlayerComponent();
    array = wasm.getLiveI32Array(wasm.getPlayerComponentProperties(player));
  });

  it("has the correct length of data properties", () => {
    expect(array.length).toBe(3);
  });

  it("has the correct defaults", () => {
    expect(wasm.getPlayerIsDead(player)).toBe(false);
    expect(wasm.getPlayerHealth(player)).toBe(100);
    expect(wasm.getPlayerHunger(player)).toBe(100);
  });

  it("changes health dynamically", () => {
    expect(wasm.getPlayerHealth(player)).toBe(100);
    expect(array[0]).toBe(100);

    array[0] = 21;
    expect(wasm.getPlayerHealth(player)).toBe(21);
  });

  it("changes player death dynamically", () => {
    expect(wasm.getPlayerIsDead(player)).toBe(false);
    expect(array[1]).toBe(0);

    array[1] = 1;
    expect(wasm.getPlayerIsDead(player)).toBe(true);
  });

  it("changes player hunger dynamically", () => {
    expect(wasm.getPlayerHunger(player)).toBe(100);
    expect(array[2]).toBe(100);

    array[2] = 1;
    expect(wasm.getPlayerHunger(player)).toBe(1);
  });
});
