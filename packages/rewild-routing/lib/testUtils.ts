import { WasmManager } from 'rewild-wasmtime';

// Mock the wasm object in the rewild-wasmtime module
jest.doMock('rewild-wasmtime/lib/WasmManager', () => {
  const wasm = {
    createTerrain: jest.fn(() => 1),
    createSkybox: jest.fn(() => 2),
    setId: jest.fn(),
    disposeObject: jest.fn(),
    addChild: jest.fn(),
    removeChild: jest.fn(),
  };

  return {
    wasm,
  };
});

WasmManager;
