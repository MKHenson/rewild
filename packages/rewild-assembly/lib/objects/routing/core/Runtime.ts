import { Listener, Event } from "rewild-common";
import { WebGPURenderer } from "../../../renderers/WebGPURenderer";
import { inputManager } from "../../../extras/io/InputManager";
import { Scene } from "../../../scenes/Scene";
import { PerspectiveCamera } from "../../../cameras/PerspectiveCamera";
import { Node } from "./Node";
import { Portal } from "./Portal";
import { addChild } from "../../../core/TransformNode";
import { GSSolver, NaiveBroadphase, World, WorldOptions } from "rewild-physics";
import { performanceNow } from "../../../Imports";
import { Terrain } from "../../../terrain/Terrain";

export class Runtime implements Listener {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  world: World;

  private nodes: Node[];
  private activeNodes: Node[];
  private inactiveNodes: Node[];
  public lastCallTime: f32 = 0;
  private resetCallTime: boolean = false;
  private terrain: Terrain;

  constructor(width: f32, height: f32, renderer: WebGPURenderer) {
    this.nodes = [];
    this.activeNodes = [];
    this.inactiveNodes = [];

    // Setup physics world
    const physicsWorldOptions = new WorldOptions();
    physicsWorldOptions.gravity.set(0, -9.8, 0);
    this.world = new World(physicsWorldOptions);
    this.world.broadphase = new NaiveBroadphase();
    (this.world.solver as GSSolver).iterations = 10;
    this.world.defaultContactMaterial.contactEquationStiffness = 1e7;
    this.world.defaultContactMaterial.contactEquationRelaxation = 4;
    this.terrain = new Terrain();

    this.renderer = renderer;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
      45,
      f32(width) / f32(height),
      0.1,
      10000
    );
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    addChild(this.scene, this.camera);

    inputManager.addEventListener("mousemove", this);
  }

  init(): void {}

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
      node.active = true;
      this.activeNodes.push(node);
      console.log(`Activating ${node.name}`);
    }
  }

  removeNode(node: Node): void {
    const nodeIndex = this.nodes.indexOf(node);
    const activeNodeIndex = this.activeNodes.indexOf(node);
    const inactiveNodeIndex = this.inactiveNodes.indexOf(node);

    if (nodeIndex == -1) throw new Error("Container does not exist");

    this.nodes.splice(this.nodes.indexOf(node), 1);

    if (activeNodeIndex != -1) this.activeNodes.splice(activeNodeIndex, 1);
    if (inactiveNodeIndex != -1)
      this.inactiveNodes.splice(inactiveNodeIndex, 1);
    if (node.active) {
      node.unMount();
      console.log(`Deactivating ${node.name}`);
    }

    node.runtime = null;
  }

  updatePhysics(): void {
    // Step world
    const timeStep: f32 = 1.0 / 60.0;
    const now = f32(performanceNow() / 1000);

    if (!this.lastCallTime) {
      // last call time not saved, cant guess elapsed time. Take a simple step.
      this.world.step(timeStep, 0);
      this.lastCallTime = now;
      return;
    }

    let timeSinceLastCall = now - this.lastCallTime;
    if (this.resetCallTime) {
      timeSinceLastCall = 0;
      this.resetCallTime = false;
    }

    this.world.step(timeStep, timeSinceLastCall);

    this.lastCallTime = now;
  }

  OnLoop(delta: f32, total: u32): void {
    const activeNodes = this.activeNodes;
    const inactiveNodes = this.inactiveNodes;

    this.updatePhysics();
    this.terrain.update();

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

  /**
   * Fires the signal from a source portal to a destination. Which in turn may start a new node
   * @param sourcePortal
   */
  sendSignal(sourcePortal: Portal): void {
    const activeNodes = this.activeNodes;
    const links = sourcePortal.links;

    // If the source is no longer active then remove it
    if (!sourcePortal.node!.active) {
      if (activeNodes.indexOf(sourcePortal.node!) != -1) {
        activeNodes.splice(activeNodes.indexOf(sourcePortal.node!), 1);
        this.inactiveNodes.push(sourcePortal.node!);

        console.log(`Deactivating ${sourcePortal.node!.name}`);
      }
    }

    for (let i: i32 = 0, l = links.length; i < l; i++) {
      unchecked(links[i]).destinationPortal!.node!.enter(
        unchecked(links[i]).destinationPortal!
      );

      console.log(
        `Entering ${unchecked(links[i]).destinationPortal!.name} of ${
          unchecked(links[i]).destinationPortal!.node!.name
        } which is active ${links[i].destinationPortal!.node!.active}`
      );

      if (
        activeNodes.indexOf(unchecked(links[i]).destinationPortal!.node!) == -1
      ) {
        activeNodes.push(unchecked(links[i]).destinationPortal!.node!);

        console.log(
          `Activating ${unchecked(links[i]).destinationPortal!.node!.name}`
        );
      }
    }
  }

  onResize(width: f32, height: f32): void {
    this.camera.aspect = f32(width) / f32(height);
    this.camera.updateProjectionMatrix();
  }

  onEvent(event: Event): void {}
}
