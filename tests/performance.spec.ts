import expect from "expect.js";
import { SimpleMatrix4 } from "./utils/math/SimpleMatrix4";
import { wasm } from "./wasm-module";

const numTests = 50000;

const matrices: SimpleMatrix4[] = new Array();
for (let i = 0; i < numTests; i++) {
  matrices.push(new SimpleMatrix4());
}

const testJSMultiplicationPerformance = (numMatrices: number = 100): void => {
  const source = new SimpleMatrix4();
  let m: SimpleMatrix4;

  for (let i = 0; i < numMatrices; i++) {
    m = matrices[i];
    m.multiplyMatrices(m, source);
  }
};

describe("Performance Tests", () => {
  before(() => {
    wasm.allocatePerfTest(numTests);

    // Warm up
    for (let i = 0; i < 3; i++) {
      wasm.testASMultiplicationPerformance(numTests);
      wasm.testASMultiplicationPerformanceWithSIMD(numTests);
      wasm.testMat4Performance(numTests);
      wasm.testMat4SIMDPerformance(numTests);
      testJSMultiplicationPerformance(numTests);
    }
  });

  after(() => {
    wasm.deallocatePerfTest();
  });

  it("is faster in wasm to use SIMD versus regular JS", () => {
    const t1 = performance.now();
    wasm.testASMultiplicationPerformanceWithSIMD(numTests);
    const simdDeltaMS = performance.now() - t1;

    const t2 = performance.now();
    testJSMultiplicationPerformance(numTests);
    const jsDeltaMS = performance.now() - t2;

    console.log(`AS Using Simd: ${simdDeltaMS}, JS: ${jsDeltaMS}`);
    expect(simdDeltaMS).to.be.lessThan(jsDeltaMS);
  });

  it("is faster in wasm when multiplying a matrix4", () => {
    const t1 = performance.now();
    wasm.testASMultiplicationPerformance(numTests);
    const asDeltaMS = performance.now() - t1;

    const t2 = performance.now();
    testJSMultiplicationPerformance(numTests);
    const jsDeltaMS = performance.now() - t2;

    console.log(`AS Without SIMD: ${asDeltaMS}, JS: ${jsDeltaMS}`);
    expect(asDeltaMS).to.be.lessThan(jsDeltaMS);
  });

  it("is faster in wasm when using SIMD versus not using it", () => {
    const t1 = performance.now();
    wasm.testMat4SIMDPerformance(numTests);
    const simdDelta = performance.now() - t1;

    const t2 = performance.now();
    wasm.testMat4Performance(numTests);
    const nonSimdPerformance = performance.now() - t2;

    console.log(`AS Matrix SIMD Time: ${simdDelta}, AS Matrix Non-SIMD Time: ${nonSimdPerformance}`);
    expect(simdDelta).to.be.lessThan(nonSimdPerformance);
  });
});
