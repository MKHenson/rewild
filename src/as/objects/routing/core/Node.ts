import { Runtime } from ".";

export class Node {
  protected children: Node[];
  protected parent: Node | null;
  runtime: Runtime | null;
  initialized: boolean;
  mounted: boolean;

  constructor() {
    this.children = [];
    this.initialized = false;
    this.parent = null;
    this.mounted = false;
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
    this.onReady();
  }

  mount(): void {
    this.mounted = true;
  }
  unMount(): void {
    this.mounted = false;
  }

  onReady(): void {}
  onUpdate(delta: f32, total: u32, fps: u32): void {}
}
