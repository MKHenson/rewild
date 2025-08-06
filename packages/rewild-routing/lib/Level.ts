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
import { IAsset } from './IAsset';

export class Level extends Container implements Listener {
  constructor(
    name: string,
    parentObject3D: IAsset,
    autoDispose: boolean = false
  ) {
    super(name, true, parentObject3D, autoDispose);
  }

  mount(): void {
    super.mount();

    const stateMachine = this.stateMachine;
    if (!stateMachine) return;

    // Activate the enter portal
    stateMachine.sendSignal(this.getPortal('Enter')!, false);
    stateMachine.addEventListener(UIEventType, this);
  }

  unMount(): void {
    super.unMount();
    const stateMachine = this.stateMachine;

    if (!stateMachine) return;

    stateMachine.removeEventListener(UIEventType, this);
  }

  onEvent(event: Event): void {
    if (event instanceof ApplicationEvent) {
      const uiEvent = event.attachment as ApplicationEvent;
      if (uiEvent.eventType == ApplicationEventType.Quit)
        this.stateMachine!.sendSignal(this.getPortal('Exit')!, true);
    }
  }

  addChild(node: Node): Node {
    if (node instanceof Container) {
      const container = node as Container;
      if (container.activeOnStartup) {
        const entranceLink = new Link();

        entranceLink.connect(
          this.getPortal('Enter')!,
          container.getPortal('Enter')!
        );
      }

      const exitLink = new Link();
      exitLink.connect(container.getPortal('Exit')!, this.getPortal('Exit')!);
    }

    return super.addChild(node);
  }

  /** When an exit portal is trigged for a level, it will signal to the runtime to exit */
  onPortalTriggered(portalEntered: Portal): void {
    super.onPortalTriggered(portalEntered);

    // Activate the exit portal
    if (portalEntered.name == 'Exit')
      this.stateMachine!.sendSignal(portalEntered, true);
  }

  dispose(): void {
    super.dispose();
  }
}
