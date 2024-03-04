import { Object3D, Player } from 'rewild-wasmtime';
import { InGameLevel } from './InGameLevel';

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
    const level = new InGameLevel(
      'Test',
      new Object3D('Test', 1),
      false,
      new Object3D('Player', 2) as Player
    );

    expect(level.findObjectByName('Terrain')).toBeDefined();
    expect(level.findObjectByName('Skybox')).toBeDefined();
  });

  it('adds the terrain, skybox & player to the parent object when mounted', () => {
    const parent = new Object3D('Parent', 1);
    const level = new InGameLevel(
      'Test',
      parent,
      false,
      new Object3D('Player', 2) as Player
    );

    level.mount();
    expect(parent.children.length).toBe(3);
  });

  it('removes the terrain and skybox from the parent object when unmounted', () => {
    const parent = new Object3D('Parent', 1);
    const level = new InGameLevel(
      'Test',
      parent,
      false,
      new Object3D('Player', 2) as Player
    );

    level.mount();
    level.unMount();
    expect(parent.children.length).toBe(0);
  });

  it('dispose the terrain and skybox when the level is disposed', () => {
    const level = new InGameLevel(
      'Test',
      new Object3D('Test', 1),
      false,
      new Object3D('Player', 2) as Player
    );

    level.dispose();
    expect(level.findObjectByName('Terrain')?.isDisposed).toBe(true);
    expect(level.findObjectByName('Skybox')?.isDisposed).toBe(true);
  });
});
