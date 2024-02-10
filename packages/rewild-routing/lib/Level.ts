import { Node } from './Node';
import { Portal } from './Portal';
import { Container } from './Container';
import { Link } from './Link';
import {
  ApplicationEventType,
  Event,
  Listener,
  UIEventType,
} from 'rewild-common';
import { ApplicationEvent } from './ApplicationEvent';
import { Object3D, wasm } from 'rewild-wasmtime';

export class Level extends Container implements Listener {
  terrain: Object3D;
  skybox: Object3D;

  constructor(
    name: string,
    parentObject3D: Object3D,
    autoDispose: boolean = false
  ) {
    super(name, true, parentObject3D, autoDispose);

    this.terrain = new Object3D('Terrain', wasm.createTerrain());
    this.skybox = new Object3D('Skybox', wasm.createSkybox());

    this.addAsset(this.terrain);
    this.addAsset(this.skybox);
  }

  mount(): void {
    super.mount();

    // Activate the enter portal
    this.runtime!.sendSignal(this.getPortal('Enter')!, false);
    this.runtime!.addEventListener(UIEventType, this);
  }

  unMount(): void {
    super.unMount();
    this.runtime!.removeEventListener(UIEventType, this);

    this.terrain.dispose();
    this.skybox.dispose();
  }

  onEvent(event: Event): void {
    if (event instanceof ApplicationEvent) {
      const uiEvent = event.attachment as ApplicationEvent;
      if (uiEvent.eventType == ApplicationEventType.Quit)
        this.runtime!.sendSignal(this.getPortal('Exit')!, true);
    }
  }

  addChild(node: Node): Node {
    if (node instanceof Container) {
      const container = node as Container;
      if (container.activeOnStartup) {
        const entranceLink = new Link();
        const exitLink = new Link();

        entranceLink.connect(
          this.getPortal('Enter')!,
          container.getPortal('Enter')!
        );

        exitLink.connect(container.getPortal('Exit')!, this.getPortal('Exit')!);
      }
    }

    return super.addChild(node);
  }

  /** When an exit portal is trigged for a level, it will signal to the runtime to exit */
  enter(portalEntered: Portal): void {
    super.enter(portalEntered);

    // Activate the exit portal
    if (portalEntered.name == 'Exit')
      this.runtime!.sendSignal(this.getPortal('Exit')!, true);
  }
}
