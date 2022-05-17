import { Runtime } from ".";
import { Portal } from "./Portal";

export class Node {
  protected portals: Portal[];
  protected children: Node[];
  protected parent: Node | null;

  runtime: Runtime | null;
  initialized: boolean;
  mounted: boolean;
  active: boolean;
  name: string;

  constructor(name: string) {
    this.name = name;
    this.children = [];
    this.portals = [];
    this.initialized = false;
    this.parent = null;
    this.mounted = false;
    this.active = false;
  }

  addChild(node: Node): Node {
    if (node.parent) {
      node.parent!.removeChild(node);
    }

    if (this.children.indexOf(node) == -1) this.children.push(node);

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

  init(): void {
    this.initialized = true;
  }

  getPortal(name: string): Portal | null {
    const portals = this.portals;
    for (let i: i32 = 0, l = portals.length; i < l; i++) if (portals[i].name == name) return portals[i];

    return null;
  }

  mount(): void {
    this.mounted = true;
  }

  unMount(): void {
    this.mounted = false;
  }

  onUpdate(delta: f32, total: u32): void {}

  enter(portalEntered: Portal): void {
    this.active = true;
  }

  exit(exitPortal: Portal, turnOff: boolean): void {
    if (turnOff) this.active = false;
    this.runtime!.sendSignal(exitPortal);
  }
}
