import { Object3D } from 'rewild-wasmtime';
import { Level } from './Level';

// Mock the wasm object in the rewild-wasmtime module
jest.mock('rewild-wasmtime/lib/WasmManager', () => {
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

describe('Level', () => {
  it('creates and adds a terrain and skybox asset', () => {
    const level = new Level('Test', new Object3D('Test', 1));

    expect(level.findObjectByName('Terrain')).toBeDefined();
    expect(level.findObjectByName('Skybox')).toBeDefined();
  });

  it('adds the terrain and skybox to the parent object when mounted', () => {
    const parent = new Object3D('Parent', 1);
    const level = new Level('Test', parent);

    level.mount();
    expect(parent.children.length).toBe(2);
  });

  it('removes the terrain and skybox from the parent object when unmounted', () => {
    const parent = new Object3D('Parent', 1);
    const level = new Level('Test', parent);

    level.mount();
    level.unMount();
    expect(parent.children.length).toBe(0);
  });

  it('dispose the terrain and skybox when the level is disposed', () => {
    const level = new Level('Test', new Object3D('Test', 1));

    level.dispose();
    expect(level.findObjectByName('Terrain')?.isDisposed).toBe(true);
    expect(level.findObjectByName('Skybox')?.isDisposed).toBe(true);
  });
});
