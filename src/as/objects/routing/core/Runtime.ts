import { Listener } from "../../../core/EventDispatcher";
import { WebGPURenderer } from "../../../renderers/WebGPURenderer";
import { inputManager } from "../../../extras/io/InputManager";
import { Event } from "../../../core/Event";
import { Scene } from "../../../scenes/Scene";
import { PerspectiveCamera } from "../../../cameras/PerspectiveCamera";
import { Container } from "./Container";
import { Node } from "./Node";
import { Portal } from "./Portal";
import { addChild } from "../../../core/TransformNode";

export class Runtime implements Listener {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;

  private nodes: Node[];
  private activeNodes: Node[];
  private inactiveNodes: Node[];

  constructor(width: f32, height: f32, renderer: WebGPURenderer) {
    this.nodes = [];
    this.activeNodes = [];
    this.inactiveNodes = [];

    this.renderer = renderer;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(45, f32(width) / f32(height), 0.1, 1000);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
    addChild(this.scene, this.camera);

    inputManager.addEventListener("mousemove", this);
  }

  getNode(name: string): Node | null {
    const nodes = this.nodes;
    for (let i: i32 = 0, l = nodes.length; i < l; i++) {
      if (unchecked(nodes[i]).name == name) return unchecked(nodes[i]);
    }

    return null;
  }

  addContainer(container: Container, activevate: boolean): void {
    container.runtime = this;
    this.nodes.push(container);
    if (activevate) this.activeNodes.push(container);
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
      }

      inactiveNodes.splice(0, numInactiveNodes);
    }

    // Initialize and mount nodes
    for (let i: i32 = 0, l: i32 = activeNodes.length; i < l; i++) {
      const node = unchecked(activeNodes[i]);

      if (!node.initialized) node.init();
      if (!node.mounted) node.mount();
    }

    for (let i: i32 = 0, l: i32 = activeNodes.length; i < l; i++) {
      unchecked(activeNodes[i]).onUpdate(delta, total);
    }

    this.renderer.render(this.scene, this.camera);
  }

  sendSignal(sourcePortal: Portal): void {
    const activeNodes = this.activeNodes;
    const links = sourcePortal.links;

    // If the source is no longer active then remove it
    if (!sourcePortal.node.active) {
      if (activeNodes.indexOf(sourcePortal.node) != -1) {
        activeNodes.splice(activeNodes.indexOf(sourcePortal.node), 1);
        this.inactiveNodes.push(sourcePortal.node);

        console.log(`Deactivating ${sourcePortal.node.name}`);
      }
    }

    for (let i: i32 = 0, l = links.length; i < l; i++) {
      unchecked(links[i]).destinationPortal!.node.enter(unchecked(links[i]).destinationPortal!);

      console.log(
        `Entering ${unchecked(links[i]).destinationPortal!.name} of ${
          unchecked(links[i]).destinationPortal!.node.name
        } which is active ${links[i].destinationPortal!.node.active}`
      );

      if (activeNodes.indexOf(unchecked(links[i]).destinationPortal!.node) == -1) {
        activeNodes.push(unchecked(links[i]).destinationPortal!.node);

        console.log(`Activating ${unchecked(links[i]).destinationPortal!.node.name}`);
      }
    }
  }

  onResize(width: f32, height: f32): void {
    this.camera.aspect = f32(width) / f32(height);
    this.camera.updateProjectionMatrix();
  }

  onEvent(event: Event): void {}
}
