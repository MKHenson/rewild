import { Runtime } from ".";
import { Portal } from "./Portal";

export class Node {
  portals: Portal[];
  parent: Node | null;
  children: Node[];
  runtime: Runtime | null;
  initialized: boolean;
  mounted: boolean;
  autoDispose: boolean;
  isDisposed: boolean;
  name: string;

  constructor(name: string, autoDispose: boolean = true) {
    this.name = name;
    this.children = [];
    this.portals = [];
    this.initialized = false;
    this.isDisposed = false;
    this.parent = null;
    this.mounted = false;
    this.autoDispose = autoDispose;
  }

  dispose(): void {
    this.isDisposed = true;

    for (let p: i32 = 0, pl: i32 = this.portals.length; p < pl; p++) {
      const portal = unchecked(this.portals[p]);
      portal.dispose();
    }

    for (let i: i32 = 0, l: i32 = this.children.length; i < l; i++) {
      const child = unchecked(this.children[i]);
      child.dispose();
    }

    this.parent = null;
    this.runtime = null;
    this.children.length = 0;
    this.portals.length = 0;
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
    return this;
  }

  removeChild(node: Node): Node {
    const i = this.children.indexOf(node);
    if (i != -1) {
      this.children.splice(i, 1);
      node.parent = null;
    }
    return this;
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
      portal.node = null;
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
