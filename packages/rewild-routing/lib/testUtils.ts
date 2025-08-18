import { WasmManager } from 'rewild-wasmtime';
import { IAsset } from './IAsset';

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

export class Asset3D implements IAsset {
  name: string;
  id: number;
  children: IAsset[] = [];

  constructor(name: string, id: number) {
    this.name = name;
    this.id = id;
  }

  add(child: IAsset): IAsset {
    this.children.push(child);
    return child;
  }

  remove(child: IAsset): IAsset {
    const index = this.children.indexOf(child);
    if (index > -1) {
      this.children.splice(index, 1);
    }
    return child;
  }
}
