import { Object3D } from 'rewild-wasmtime';
import { Level } from './Level';
import { StateMachine } from './StateMachine';
import { Container } from './Container';

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

  it('deactivates when its called via onPortalTriggered by an Exit portal ', () => {
    const level = new Level('Test', new Object3D('Test', 1));
    const stateMachine = new StateMachine();
    stateMachine.addNode(level, true);

    stateMachine.OnLoop(0, 0);
    expect(level.mounted).toBe(true);

    // Fake this call for now
    level.onPortalTriggered(level.getPortal('Exit')!);
    stateMachine.OnLoop(0, 0);

    expect(level.mounted).toBe(false);
    expect(stateMachine.activeNodes.length).toBe(0);
  });

  it('will link containers that have activeOnStartup set to true to the start event', () => {
    const level = new Level('Test', new Object3D('Test', 1));
    const container = new Container('Container', true, new Object3D('Test', 1));
    const stateMachine = new StateMachine();
    stateMachine.addNode(level, true);

    level.addChild(container);
    expect(level.getPortal('Enter')?.links.length).toBe(1);
    expect(level.getPortal('Enter')?.links[0].destinationPortal).toBe(
      container.getPortal('Enter')
    );

    expect(container.getPortal('Exit')?.links.length).toBe(1);
    expect(container.getPortal('Exit')?.links[0].destinationPortal).toBe(
      level.getPortal('Exit')
    );
  });

  it('will activate its Enter portal on a mount, and activate any containers added to it', () => {
    const level = new Level('Test', new Object3D('Test', 1));
    const container = new Container('Container', true, new Object3D('Test', 1));
    const stateMachine = new StateMachine();
    stateMachine.addNode(level, true);
    level.addChild(container);

    stateMachine.OnLoop(0, 0);
    expect(container.mounted).toBe(false);
    expect(level.mounted).toBe(true);

    stateMachine.OnLoop(0, 0);

    expect(container.mounted).toBe(true);
    expect(level.mounted).toBe(true);
  });

  it('will deactivate when any of its container Exit portals are triggered', () => {
    const level = new Level('Test', new Object3D('Test', 1));
    const container = new Container('Container', true, new Object3D('Test', 1));
    const stateMachine = new StateMachine();
    stateMachine.addNode(level, true);
    level.addChild(container);

    stateMachine.OnLoop(0, 0);
    stateMachine.OnLoop(0, 0);
    expect(container.mounted).toBe(true);
    expect(level.mounted).toBe(true);

    stateMachine.sendSignal(container.getPortal('Exit')!, true);
    stateMachine.OnLoop(0, 0);
    expect(container.mounted).toBe(false);
    expect(level.mounted).toBe(false);
  });
});
