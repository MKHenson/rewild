import expect from "expect.js";
import { SimpleMatrix4 } from "./utils/math/SimpleMatrix4";
import { wasm } from "./wasm-module";

const numTests = 20000;

const matrices: SimpleMatrix4[] = new Array();
for (let i = 0; i < numTests; i++) {
  matrices.push(new SimpleMatrix4().set(1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0));
}

describe("Performance Tests", () => {
  before(() => {
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

  after(() => {
    wasm.deallocatePerfTest();
  });

  it("is faster in wasm to use SIMD versus regular JS", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4Multiply(numTests, true);
    const simdDeltaMS = performance.now() - t1;

    const t2 = performance.now();
    testJSMultiplicationPerformance(numTests);
    const jsDeltaMS = performance.now() - t2;

    console.log(`AS Using Simd: ${simdDeltaMS}, JS: ${jsDeltaMS}`);
    expect(simdDeltaMS).to.be.lessThan(jsDeltaMS);
  });

  it("is faster in AS when multiplying a matrix4 compared to JS", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4Multiply(numTests);
    const asDeltaMS = performance.now() - t1;

    const t2 = performance.now();
    testJSMultiplicationPerformance(numTests);
    const jsDeltaMS = performance.now() - t2;

    console.log(`AS Without SIMD: ${asDeltaMS}, JS: ${jsDeltaMS}`);
    expect(asDeltaMS).to.be.lessThan(jsDeltaMS);
  });

  it("multiplies mat4 faster in SIMD versus non-SIMD", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4Multiply(numTests, true);
    const simdDelta = performance.now() - t1;

    const t2 = performance.now();
    wasm.testPerformanceMat4Multiply(numTests);
    const nonSimdPerformance = performance.now() - t2;

    console.log(`Matrix Multiply: SIMD Time: ${simdDelta}, Non-SIMD Time: ${nonSimdPerformance}`);
    expect(simdDelta).to.be.lessThan(nonSimdPerformance);
  });

  it("scales mat4 faster in SIMD versus non-SIMD", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4Scale(numTests, true);
    const simdDelta = performance.now() - t1;

    const t2 = performance.now();
    wasm.testPerformanceMat4Scale(numTests);
    const nonSimdPerformance = performance.now() - t2;

    console.log(`Matrix Scale: SIMD Time: ${simdDelta}, Non-SIMD Time: ${nonSimdPerformance}`);
    expect(simdDelta).to.be.lessThan(nonSimdPerformance);
  });

  it("inverts mat4 faster in SIMD versus non-SIMD", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4Inverse(numTests, true);
    const simdDelta = performance.now() - t1;

    const t2 = performance.now();
    wasm.testPerformanceMat4Inverse(numTests);
    const nonSimdPerformance = performance.now() - t2;

    console.log(`Matrix Inverse: SIMD Time: ${simdDelta}, Non-SIMD Time: ${nonSimdPerformance}`);
    expect(simdDelta).to.be.lessThan(nonSimdPerformance);
  });

  it("multiplies a scalar mat4 faster in SIMD versus non-SIMD", () => {
    const t1 = performance.now();
    wasm.testPerformanceMat4MultiplyScalar(numTests, true);
    const simdDelta = performance.now() - t1;

    const t2 = performance.now();
    wasm.testPerformanceMat4MultiplyScalar(numTests);
    const nonSimdPerformance = performance.now() - t2;

    console.log(`Matrix Multiply Scalar: SIMD Time: ${simdDelta}, Non-SIMD Time: ${nonSimdPerformance}`);
    expect(simdDelta).to.be.lessThan(nonSimdPerformance);
  });

  it("is faster to batch calls to AS compared to individual calls", () => {
    const t1 = performance.now();
    for (let i = 0, l = numTests; i < l; i++) wasm.testPerformanceSingleMultiplyScalar();
    const nonBatched = performance.now() - t1;

    const t2 = performance.now();
    wasm.testPerformanceMat4MultiplyScalar(numTests);
    const batched = performance.now() - t2;

    console.log(`Batched Versus Non-Batched: Non-Batched ${nonBatched}, Batched: ${batched}`);
    expect(batched).to.be.lessThan(nonBatched);
  });
});

const testJSMultiplicationPerformance = (l: number = 100): void => {
  const source = new SimpleMatrix4();
  let m: SimpleMatrix4;

  for (let i = 0; i < l; i++) {
    m = matrices[i];
    m.multiplyMatrices(m, source);
  }
};
