import { Node } from './Node';
import { addChild, removeChild } from '../../../core/TransformNode';
import { Portal } from './Portal';
import { Container } from './Container';
import { Link } from './Link';
import { Terrain } from '../../terrain/Terrain';
import {
  ApplicationEventType,
  Event,
  Listener,
  UIEventType,
} from 'rewild-common';
import { ApplicationEvent } from '../../../extras/ui/ApplicationEvent';
import { uiSignaller } from '../../../extras/ui/uiSignalManager';
import { Skybox } from '../../skybox/Skybox';

export class Level extends Container implements Listener {
  terrain: Terrain;
  skybox: Skybox;

  constructor(name: string, autoDispose: boolean = false) {
    super(name, autoDispose);

    this.terrain = new Terrain();
    this.skybox = new Skybox();
  }

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);
  }

  mount(): void {
    super.mount();

    // Activate the enter portal
    addChild(this.runtime!.scene, this.terrain);
    addChild(this.runtime!.scene, this.skybox);
    this.runtime!.sendSignal(this.getPortal('Enter')!, false);
    uiSignaller.addEventListener(UIEventType, this);
  }

  unMount(): void {
    super.unMount();
    removeChild(this.runtime!.scene, this.terrain);
    removeChild(this.runtime!.scene, this.skybox);
    uiSignaller.removeEventListener(UIEventType, this);
  }

  onEvent(event: Event): void {
    if (event.attachment instanceof ApplicationEvent) {
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

export function createLevel(name: string): Node {
  return new Level(name);
}
