import { EventDispatcher } from 'rewild-common';
import { Node } from './Node';
import { Portal } from './Portal';

export class StateMachine extends EventDispatcher {
  readonly nodes: Node[];
  readonly activeNodes: Node[];
  private inactiveNodes: Node[];

  constructor() {
    super();
    this.nodes = [];
    this.activeNodes = [];
    this.inactiveNodes = [];
  }

  getNode(name: string): Node | null {
    const nodes = this.nodes;
    for (let i: i32 = 0, l = nodes.length; i < l; i++) {
      if (unchecked(nodes[i]).name == name) return unchecked(nodes[i]);
    }

    return null;
  }

  addNode(node: Node, activevate: boolean): void {
    node.runtime = this;
    this.nodes.push(node);

    if (activevate) {
      this.activeNodes.push(node);
    }
  }

  removeNode(node: Node, removeFromInactiveNodes: boolean = true): void {
    for (let i: i32 = 0, l: i32 = node.children.length; i < l; i++) {
      const child = unchecked(node.children[i]);
      this.removeNode(child, removeFromInactiveNodes);
    }

    const nodeIndex = this.nodes.indexOf(node);
    const activeNodeIndex = this.activeNodes.indexOf(node);
    const inactiveNodeIndex = this.inactiveNodes.indexOf(node);

    if (nodeIndex != -1) this.nodes.splice(nodeIndex, 1);

    if (activeNodeIndex != -1) {
      this.activeNodes.splice(activeNodeIndex, 1);
      if (node.mounted) node.unMount();
    }

    if (removeFromInactiveNodes && inactiveNodeIndex != -1) {
      if (node.mounted) node.unMount();
      this.inactiveNodes.splice(inactiveNodeIndex, 1);
    }

    node.dispose();
    node.runtime = null;
  }

  OnLoop(delta: f32, total: u32): void {
    const activeNodes = this.activeNodes;
    const inactiveNodes = this.inactiveNodes;

    // Unmount inactive nodes
    const numInactiveNodes = inactiveNodes.length;
    if (numInactiveNodes) {
      for (let i: i32 = 0; i < numInactiveNodes; i++) {
        const node = unchecked(inactiveNodes[i]);
        node.unMount();
        if (node.autoDispose) this.removeNode(node, false);
      }

      inactiveNodes.splice(0, numInactiveNodes);
    }

    // Initialize and mount nodes
    for (let i: i32 = 0, l: i32 = activeNodes.length; i < l; i++) {
      const node = unchecked(activeNodes[i]);

      if (!node.initialized) node.init();
      if (!node.mounted) {
        if (node.isDisposed) throw new Error(`Node ${node.name} is disposed`);
        node.mount();
      }
    }

    for (let i: i32 = 0, l: i32 = activeNodes.length; i < l; i++) {
      unchecked(activeNodes[i]).onUpdate(delta, total);
    }
  }

  private deactivateNode(node: Node): void {
    const activeNodes = this.activeNodes;
    const inactiveNodes = this.inactiveNodes;

    for (let i: i32 = 0, l: i32 = node.children.length; i < l; i++) {
      const child = unchecked(node.children[i]);

      this.deactivateNode(child);
    }

    if (activeNodes.indexOf(node) != -1) {
      activeNodes.splice(activeNodes.indexOf(node), 1);
    }

    if (inactiveNodes.indexOf(node) == -1) {
      inactiveNodes.push(node);
    }
  }

  /**
   * Fires the signal from a source portal to a destination. Which in turn may start a new node
   * @param sourcePortal
   */
  sendSignal(sourcePortal: Portal, turnOff: boolean): void {
    const activeNodes = this.activeNodes;
    const links = sourcePortal.links;

    // If the source is no longer active then remove it from the active nodes
    if (turnOff) this.deactivateNode(sourcePortal.node!);

    // Enter each of the destination nodes
    // and add them to the active nodes
    for (let i: i32 = 0, l = links.length; i < l; i++) {
      const link = unchecked(links[i]);
      const destPortal = link.destinationPortal!;
      destPortal.node!.enter(destPortal);

      if (activeNodes.indexOf(destPortal.node!) == -1) {
        activeNodes.push(destPortal.node!);
      }
    }
  }
}