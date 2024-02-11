import { Link } from './Link';
import { Node } from './Node';
import { Portal } from './Portal';
import { StateMachine } from './StateMachine';

describe('StateMachine', () => {
  it('can add a new node', () => {
    const stateMachine = new StateMachine();
    const node = new Node('test');

    stateMachine.addNode(node, true);
    expect(stateMachine.nodes.length).toBe(1);
    expect(node.stateMachine).toBe(stateMachine);
  });

  it('can add and activate a new node', () => {
    const stateMachine = new StateMachine();
    const node = new Node('test');

    stateMachine.addNode(node, true);
    expect(stateMachine.activeNodes.length).toBe(1);
  });

  it('can remove a node', () => {
    const stateMachine = new StateMachine();
    const node = new Node('test1');

    stateMachine.addNode(node, true);

    expect(stateMachine.nodes.length).toBe(1);
    expect(stateMachine.activeNodes.length).toBe(1);

    stateMachine.removeNode(node);

    expect(stateMachine.nodes.length).toBe(0);
    expect(stateMachine.activeNodes.length).toBe(0);

    expect(node.stateMachine).toBe(null);
    expect(node.isDisposed).toBe(true);
  });

  it('will unmount a node when it is removed', () => {
    const stateMachine = new StateMachine();
    const node = new Node('test1');

    stateMachine.addNode(node, true);
    stateMachine.OnLoop(0, 0);

    expect(node.mounted).toBe(true);

    stateMachine.removeNode(node);
    expect(node.mounted).toBe(false);
  });

  it('will dispose of a node whose signal has exited, if autoDispose is true', () => {
    const stateMachine = new StateMachine();
    const node = new Node('test1');
    const exitPortal = node.addPortal(new Portal('exit'));

    stateMachine.addNode(node, true);
    stateMachine.OnLoop(0, 0);

    expect(node.isDisposed).toBe(false);

    stateMachine.sendSignal(exitPortal, true);
    stateMachine.OnLoop(0, 0);

    expect(node.isDisposed).toBe(true);
    expect(stateMachine.nodes.length).toBe(0);
  });

  it('will not dispose of a node whose signal has exited, if autoDispose is false', () => {
    const stateMachine = new StateMachine();
    const node = new Node('test1', false);
    const exitPortal = node.addPortal(new Portal('exit'));

    stateMachine.addNode(node, true);
    stateMachine.OnLoop(0, 0);

    expect(node.isDisposed).toBe(false);

    stateMachine.sendSignal(exitPortal, true);
    stateMachine.OnLoop(0, 0);

    expect(node.isDisposed).toBe(false);
    expect(stateMachine.nodes.length).toBe(1);
    expect(stateMachine.activeNodes.length).toBe(0);
  });

  it('will mount & initialize an active node if it is not mounted or initialized', () => {
    const stateMachine = new StateMachine();
    const node = new Node('test1');

    stateMachine.addNode(node, true);

    expect(node.mounted).toBe(false);
    expect(node.initialized).toBe(false);

    stateMachine.OnLoop(0, 0);

    expect(node.mounted).toBe(true);
    expect(node.initialized).toBe(true);
  });

  it('will move activate a node by sending a signal. The active node will become inactive and unmouted and the destinations will become active', () => {
    const stateMachine = new StateMachine();
    const node1 = new Node('test1');
    const node2 = new Node('test2');
    const node3 = new Node('test3');

    // Link node1 to node2
    const exitPortal = node1.addPortal(new Portal('exit from test1'));
    const entryToNode2 = node2.addPortal(new Portal('start'));
    const entryToNode3 = node3.addPortal(new Portal('start'));

    new Link().connect(exitPortal, entryToNode2);
    new Link().connect(exitPortal, entryToNode3);

    stateMachine.addNode(node1, true);
    stateMachine.addNode(node2, false);
    stateMachine.addNode(node3, false);

    expect(stateMachine.activeNodes.length).toBe(1);
    expect(stateMachine.activeNodes[0]).toBe(node1);

    stateMachine.OnLoop(0, 0);

    expect(node1.mounted).toBe(true);
    expect(node2.mounted).toBe(false);
    expect(node3.mounted).toBe(false);

    stateMachine.sendSignal(exitPortal, true);
    stateMachine.OnLoop(0, 0);

    expect(stateMachine.activeNodes.length).toBe(2);
    expect(stateMachine.activeNodes[0]).toBe(node2);
    expect(stateMachine.activeNodes[1]).toBe(node3);
    expect(node1.mounted).toBe(false);
    expect(node2.mounted).toBe(true);
    expect(node3.mounted).toBe(true);
  });
});
