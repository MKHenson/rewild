import { Runtime } from ".";
import { Portal } from "./Portal";

export class Node {
  protected portals: Portal[];
  children: Node[];
  protected parent: Node | null;

  runtime: Runtime | null;
  initialized: boolean;
  mounted: boolean;
  autoDispose: boolean;
  name: string;

  constructor(name: string, autoDispose: boolean = true) {
    this.name = name;
    this.children = [];
    this.portals = [];
    this.initialized = false;
    this.parent = null;
    this.mounted = false;
    this.autoDispose = autoDispose;
  }

  addChild(node: Node): Node {
    if (node.parent) {
      node.parent!.removeChild(node);
    }

    if (this.children.indexOf(node) == -1) {
      this.children.push(node);
      node.runtime = this.runtime;
    }

    node.parent = this;
    return node;
  }

  removeChild(node: Node): Node {
    const i = this.children.indexOf(node);
    if (i != -1) {
      this.children.splice(i, 1);
      node.parent = null;
    }
    return node;
  }

  addPortal(portal: Portal): Portal {
    if (this.portals.indexOf(portal) == -1) {
      this.portals.push(portal);
      portal.node = this;
    }
    return portal;
  }

  removePortal(portal: Portal): Portal {
    const i = this.portals.indexOf(portal);
    if (i != -1) {
      this.portals.splice(i, 1);
    }
    return portal;
  }

  init(): void {
    this.initialized = true;
  }

  getPortal(name: string): Portal | null {
    const portals = this.portals;
    for (let i: i32 = 0, l = portals.length; i < l; i++)
      if (portals[i].name == name) return portals[i];

    return null;
  }

  mount(): void {
    this.mounted = true;
  }

  unMount(): void {
    this.mounted = false;
  }

  onUpdate(delta: f32, total: u32): void {}

  enter(portalEntered: Portal): void {}
}

export function addChildNode(parent: Node, child: Node): void {
  parent.addChild(child);
}

export function removeChildNode(parent: Node, child: Node): void {
  parent.removeChild(child);
}

export function getNodePortal(node: Node, portalName: string): Portal | null {
  return node.getPortal(portalName);
}

export function addNodePortal(node: Node, portal: Portal): void {
  node.addPortal(portal);
}

export function removeNodePortal(node: Node, portal: Portal): void {
  node.removePortal(portal);
}
