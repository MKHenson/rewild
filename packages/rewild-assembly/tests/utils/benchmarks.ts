import { Matrix4 } from "rewild-common";
import { init, wasm } from "./wasm-module";

const numTests = 20000;

const matrices: Matrix4[] = new Array();
for (let i = 0; i < numTests; i++) {
  matrices.push(new Matrix4().set(1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0));
}

const testJSMultiplicationPerformance = (numMatrices: number = 100): void => {
  const source = new Matrix4();
  let m: Matrix4;

  for (let i = 0; i < numMatrices; i++) {
    m = matrices[i];
    m.multiplyMatrices(m, source);
  }
};

function testSIMDVersusJS() {
  const t1 = performance.now();
  wasm.testPerformanceMat4Multiply(numTests, true);
  const simdDeltaMS = performance.now() - t1;

  const t2 = performance.now();
  testJSMultiplicationPerformance(numTests);
  const jsDeltaMS = performance.now() - t2;

  console.log(`SIMD versus JS: \t\tSIMD: ${simdDeltaMS}, JS: ${jsDeltaMS}`);
}

function testASVersusJS() {
  const t1 = performance.now();
  wasm.testPerformanceMat4Multiply(numTests);
  const asDeltaMS = performance.now() - t1;

  const t2 = performance.now();
  testJSMultiplicationPerformance(numTests);
  const jsDeltaMS = performance.now() - t2;

  console.log(`AS Without SIMD Versus JS: \tNON-SIMD: ${asDeltaMS}, JS: ${jsDeltaMS}`);
}

function testMat4MultiplySIMDvsAS() {
  const t1 = performance.now();
  wasm.testPerformanceMat4Multiply(numTests, true);
  const simdDelta = performance.now() - t1;

  const t2 = performance.now();
  wasm.testPerformanceMat4Multiply(numTests);
  const nonSimdPerformance = performance.now() - t2;

  console.log(`Matrix_Multiply: \t\tSIMD Time: ${simdDelta}, Non_SIMD Time: ${nonSimdPerformance}`);
}

function testMat4ScaleSIMDvsAS() {
  const t1 = performance.now();
  wasm.testPerformanceMat4Scale(numTests, true);
  const simdDelta = performance.now() - t1;

  const t2 = performance.now();
  wasm.testPerformanceMat4Scale(numTests);
  const nonSimdPerformance = performance.now() - t2;

  console.log(`Matrix Scale: \t\t\tSIMD Time: ${simdDelta}, Non_SIMD Time: ${nonSimdPerformance}`);
}

function testMat4InverseSIMDvsAS() {
  const t1 = performance.now();
  wasm.testPerformanceMat4Inverse(numTests, true);
  const simdDelta = performance.now() - t1;

  const t2 = performance.now();
  wasm.testPerformanceMat4Inverse(numTests);
  const nonSimdPerformance = performance.now() - t2;

  console.log(`Matrix Inverse: \t\tSIMD Time: ${simdDelta}, Non-SIMD_Time: ${nonSimdPerformance}`);
}

function testMat4MultiplyScalarSIMDvsAS() {
  const t1 = performance.now();
  wasm.testPerformanceMat4MultiplyScalar(numTests, true);
  const simdDelta = performance.now() - t1;

  const t2 = performance.now();
  wasm.testPerformanceMat4MultiplyScalar(numTests);
  const nonSimdPerformance = performance.now() - t2;

  console.log(`Matrix Multiply Scalar: \tSIMD Time: ${simdDelta}, Non-SIMD Time: ${nonSimdPerformance}`);
}

async function start() {
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

  console.log("..................................");
  console.log(".........STARTING TESTS...........");
  console.log("..................................");
  testSIMDVersusJS();
  testASVersusJS();
  testMat4MultiplySIMDvsAS();
  testMat4ScaleSIMDvsAS();
  testMat4InverseSIMDvsAS();
  testMat4MultiplyScalarSIMDvsAS();

  wasm.deallocatePerfTest();
}

start();
