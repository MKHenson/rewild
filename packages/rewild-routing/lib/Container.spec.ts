import { Container } from './Container';
import { Asset3D } from './testUtils';

// Mock the wasm object in the rewild-wasmtime module
jest.mock('rewild-wasmtime/lib/WasmManager', () => {
  const wasm = {
    setId: jest.fn(),
    disposeObject: jest.fn(),
    addChild: jest.fn(),
    removeChild: jest.fn(),
  };

  return {
    wasm,
  };
});

describe('Container', () => {
  it('creates a container with the correct defaults', () => {
    const container = new Container('Test', true, new Asset3D('Test', 1));

    expect(container.name).toBe('Test');
    expect(container.activeOnStartup).toBe(true);
    expect(container.parent).toBeDefined();

    // Has the right portals
    expect(container.getPortal('Enter')).toBeDefined();
    expect(container.getPortal('Exit')).toBeDefined();
  });

  it('adds objects to the parent object when mounted', () => {
    const parent = new Asset3D('Parent', 1);
    const childObject = new Asset3D('Child', 2);
    const container = new Container('Test', true, parent);
    container.addAsset(childObject);

    container.mount();
    expect(parent.children.length).toBe(1);
  });

  it('removes objects from the parent object when unmounted', () => {
    const parent = new Asset3D('Parent', 1);
    const childObject = new Asset3D('Child', 2);
    const container = new Container('Test', true, parent);
    container.addAsset(childObject);

    container.mount();
    container.unMount();
    expect(parent.children.length).toBe(0);
  });

  it('disposes itself correct', () => {
    const container = new Container('Test', true, new Asset3D('Test', 1));
    container.dispose();
    expect(container.isDisposed).toBe(true);
  });
});
