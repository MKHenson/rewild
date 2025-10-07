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
    const container = new Container('Test', true, new Asset3D('Test', '1'));

    expect(container.name).toBe('Test');
    expect(container.activeOnStartup).toBe(true);
    expect(container.parent).toBeDefined();

    // Has the right portals
    expect(container.getPortal('Enter')).toBeDefined();
    expect(container.getPortal('Exit')).toBeDefined();
  });

  it('adds objects to the parent object when mounted', () => {
    const parent = new Asset3D('Parent', '1');
    const childObject = new Asset3D('Child', '2');
    const container = new Container('Test', true, parent);
    container.addAsset(childObject);

    container.mount();
    expect(parent.children.length).toBe(1);
  });

  it('removes assets correctly', () => {
    const container = new Container('Test', true, new Asset3D('Test', '1'));
    const asset1 = new Asset3D('Asset1', '2');
    const asset2 = new Asset3D('Asset2', '3');
    container.addAsset(asset1);
    container.addAsset(asset2);

    expect(container.findObjectByName('Asset1')).toBe(asset1);
    expect(container.findObjectByName('Asset2')).toBe(asset2);

    container.removeAsset(asset1);
    expect(container.findObjectByName('Asset1')).toBeNull();
    expect(container.findObjectByName('Asset2')).toBe(asset2);
  });

  it('removes objects from the parent object when unmounted', () => {
    const parent = new Asset3D('Parent', '1');
    const childObject = new Asset3D('Child', '2');
    const container = new Container('Test', true, parent);
    container.addAsset(childObject);

    container.mount();
    container.unMount();
    expect(parent.children.length).toBe(0);
  });

  it('disposes itself correct', () => {
    const container = new Container('Test', true, new Asset3D('Test', '1'));
    container.dispose();
    expect(container.isDisposed).toBe(true);
  });

  it('calls onUpdate for each behavior of each asset in a container', () => {
    const container = new Container('Test', true, new Asset3D('Test', '1'));
    const asset1 = new Asset3D('Asset1', '2');
    const asset2 = new Asset3D('Asset2', '3');
    container.addAsset(asset1);
    container.addAsset(asset2);

    const onUpdateMock = jest.fn();
    asset1.behaviours.push({ name: 'b1', onUpdate: onUpdateMock });
    asset2.behaviours.push({ name: 'b2', onUpdate: onUpdateMock });

    container.onUpdate(16, 1000);
    expect(onUpdateMock).toHaveBeenCalledTimes(2);
  });
});
