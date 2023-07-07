import { init, wasm } from "./utils/wasm-module";

describe("PhysicsComponent", () => {
  let component: any;
  let array: Float32Array;

  beforeAll(async () => {
    await init();
  });

  it("creates a transform node & live view of data properties", () => {
    component = wasm.createPhysicsComponent();
    array = wasm.getLiveF32Array(wasm.getPhysicsComponentProperties(component));
  });

  it("has the correct length of data properties", () => {
    expect(array.length).toBe(10);
  });

  it("has the correct defaults", () => {
    expect(wasm.getPhysicsComponentPosX(component)).toBe(0);
    expect(wasm.getPhysicsComponentPosY(component)).toBe(0);
    expect(wasm.getPhysicsComponentPosZ(component)).toBe(0);
    expect(wasm.getPhysicsComponentVelX(component)).toBe(0);
    expect(wasm.getPhysicsComponentVelY(component)).toBe(0);
    expect(wasm.getPhysicsComponentVelZ(component)).toBe(0);
    expect(wasm.getPhysicsComponentAngVelX(component)).toBe(0);
    expect(wasm.getPhysicsComponentAngVelY(component)).toBe(0);
    expect(wasm.getPhysicsComponentAngVelZ(component)).toBe(0);
    expect(wasm.getPhysicsComponentMass(component)).toBe(0);
  });

  it("changes pos x dynamically", () => {
    expect(wasm.getPhysicsComponentPosX(component)).toBe(0);
    expect(array[0]).toBe(0);

    array[0] = 1.5;
    expect(wasm.getPhysicsComponentPosX(component)).toBe(1.5);
  });

  it("changes pos y dynamically", () => {
    expect(wasm.getPhysicsComponentPosY(component)).toBe(0);
    expect(array[1]).toBe(0);

    array[1] = 2.5;
    expect(wasm.getPhysicsComponentPosY(component)).toBe(2.5);
  });

  it("changes pos z dynamically", () => {
    expect(wasm.getPhysicsComponentPosZ(component)).toBe(0);

    array[2] = 3.5;
    expect(wasm.getPhysicsComponentPosZ(component)).toBe(3.5);
  });

  it("changes vel x dynamically", () => {
    expect(wasm.getPhysicsComponentVelX(component)).toBe(0);
    expect(array[3]).toBe(0);

    array[3] = 4.5;
    expect(wasm.getPhysicsComponentVelX(component)).toBe(4.5);
  });

  it("changes vel y dynamically", () => {
    expect(wasm.getPhysicsComponentVelY(component)).toBe(0);
    expect(array[4]).toBe(0);

    array[4] = 5.5;
    expect(wasm.getPhysicsComponentVelY(component)).toBe(5.5);
  });

  it("changes vel z dynamically", () => {
    expect(wasm.getPhysicsComponentVelZ(component)).toBe(0);
    expect(array[5]).toBe(0);

    array[5] = 6.5;
    expect(wasm.getPhysicsComponentVelZ(component)).toBe(6.5);
  });

  it("changes ang vel x dynamically", () => {
    expect(wasm.getPhysicsComponentAngVelX(component)).toBe(0);
    expect(array[6]).toBe(0);

    array[6] = 7.5;
    expect(wasm.getPhysicsComponentAngVelX(component)).toBe(7.5);
  });

  it("changes ang vel y dynamically", () => {
    expect(wasm.getPhysicsComponentAngVelY(component)).toBe(0);
    expect(array[7]).toBe(0);

    array[7] = 8.5;
    expect(wasm.getPhysicsComponentAngVelY(component)).toBe(8.5);
  });

  it("changes ang vel z dynamically", () => {
    expect(wasm.getPhysicsComponentAngVelZ(component)).toBe(0);
    expect(array[8]).toBe(0);

    array[8] = 9.5;
    expect(wasm.getPhysicsComponentAngVelZ(component)).toBe(9.5);
  });

  it("changes mass dynamically", () => {
    expect(wasm.getPhysicsComponentMass(component)).toBe(0);
    expect(array[9]).toBe(0);

    array[9] = 21.5;
    expect(wasm.getPhysicsComponentMass(component)).toBe(21.5);
  });
});
