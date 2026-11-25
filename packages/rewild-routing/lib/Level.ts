import { Node } from './Node';
import { Portal } from './Portal';
import { Container } from './Container';
import { Link } from './Link';
import { IAsset } from './IAsset';

export class Level extends Container {
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
  }

  unMount(): void {
    super.unMount();
    const stateMachine = this.stateMachine;

    if (!stateMachine) return;
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

  /** The asset with this id in the level or any of its containers, active or not. */
  findAssetById(id: string): IAsset | null {
    const own = this.findObjectById(id);
    if (own) return own;
    const children = this.children;
    for (let i: i32 = 0, l = children.length; i < l; i++) {
      const child = children[i];
      if (!(child instanceof Container)) continue;
      const asset = child.findObjectById(id);
      if (asset) return asset;
    }
    return null;
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
