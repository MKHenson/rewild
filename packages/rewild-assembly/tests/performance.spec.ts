import { Matrix4 } from "rewild-common";
import { init, wasm } from "./utils/wasm-module";

const numTests = 20000;

const matrices: Matrix4[] = new Array();
for (let i = 0; i < numTests; i++) {
  matrices.push(new Matrix4().set(1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0));
}

describe("Performance Tests", () => {
  beforeAll(async () => {
    await init();
    wasm.allocatePerfTest(numTests);

    // Warm up
    for (let i = 0; i < 3; i++) {
      wasm.testPerformanceMat4Multiply(numTests);
      wasm.testPerformanceMat4MultiplyScalar(numTests);
      wasm.testPerformanceMat4Inverse(numTests);
      wasm.testPerformanceMat4Scale(numTests);
      testJSMultiplicationPerformance(numTests);
    }
  });

  afterAll(() => {
    wasm.deallocatePerfTest();
  });

  it("is faster in wasm to use SIMD versus regular JS", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4Multiply(numTests, true);
    const simdDeltaMS = performance.now() - t1;

    const t2 = performance.now();
    testJSMultiplicationPerformance(numTests);
    const jsDeltaMS = performance.now() - t2;

    expect(simdDeltaMS).toBeLessThan(jsDeltaMS);
  });

  it("is faster in AS when multiplying a matrix4 compared to JS", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4Multiply(numTests);
    const asDeltaMS = performance.now() - t1;

    const t2 = performance.now();
    testJSMultiplicationPerformance(numTests);
    const jsDeltaMS = performance.now() - t2;

    expect(asDeltaMS).toBeLessThan(jsDeltaMS);
  });

  it("multiplies mat4 faster in SIMD versus non-SIMD", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4Multiply(numTests, true);
    const simdDelta = performance.now() - t1;

    const t2 = performance.now();
    wasm.testPerformanceMat4Multiply(numTests);
    const nonSimdPerformance = performance.now() - t2;

    expect(simdDelta).toBeLessThan(nonSimdPerformance);
  });

  it("scales mat4 faster in SIMD versus non-SIMD", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4Scale(numTests, true);
    const simdDelta = performance.now() - t1;

    const t2 = performance.now();
    wasm.testPerformanceMat4Scale(numTests);
    const nonSimdPerformance = performance.now() - t2;

    expect(simdDelta).toBeLessThan(nonSimdPerformance);
  });

  it("inverts mat4 faster in SIMD versus non-SIMD", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4Inverse(numTests, true);
    const simdDelta = performance.now() - t1;

    const t2 = performance.now();
    wasm.testPerformanceMat4Inverse(numTests);
    const nonSimdPerformance = performance.now() - t2;

    expect(simdDelta).toBeLessThan(nonSimdPerformance);
  });

  it("multiplies a scalar mat4 faster in SIMD versus non-SIMD", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4MultiplyScalar(numTests, true);
    const simdDelta = performance.now() - t1;

    const t2 = performance.now();
    wasm.testPerformanceMat4MultiplyScalar(numTests);
    const nonSimdPerformance = performance.now() - t2;

    expect(simdDelta).toBeLessThan(nonSimdPerformance);
  });

  it("is faster to batch calls to AS compared to individual calls", () => {
    const t1 = performance.now();
    for (let i = 0, l = numTests; i < l; i++) wasm.testPerformanceSingleMultiplyScalar();
    const nonBatched = performance.now() - t1;

    const t2 = performance.now();
    wasm.testPerformanceMat4MultiplyScalar(numTests);
    const batched = performance.now() - t2;

    expect(batched).toBeLessThan(nonBatched);
  });
});

const testJSMultiplicationPerformance = (l: number = 100): void => {
  const source = new Matrix4();
  let m: Matrix4;

  for (let i = 0; i < l; i++) {
    m = matrices[i];
    m.multiplyMatrices(m, source);
  }
};
