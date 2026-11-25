import { Button, Label, Stack, UIComponent, UINode } from 'rewild-gpu-ui';
import { Level } from 'rewild-routing';
import { PortalAsset } from '../routing/PortalAsset';
import { PORTAL_ACTIONS, PortalAction } from '../routing/actions';

/** What the tab reads and tells: the level's portal. */
export type PortalTarget = Pick<PortalAsset, 'name' | 'locked' | 'doAction'>;

/** The level's portal, in any container. A level has at most one. */
export function levelPortal(level: Level | null): PortalAsset | null {
  if (!level?.stateMachine) return null;
  const portal = level.stateMachine
    .getAllAssets(level)
    .find((asset) => asset instanceof PortalAsset);
  return (portal as PortalAsset | undefined) ?? null;
}

/**
 * The assistant's Portal tab: the portal's name and whether it is locked,
 * and a button for each portal action.
 */
export class PortalTab implements UIComponent {
  readonly node: UINode;
  readonly status: Label;
  readonly buttons: Button[];

  constructor(private readonly findPortal: () => PortalTarget | null) {
    this.status = new Label({
      text: '',
      name: 'status',
      style: { color: 'onSurface', fontSize: 28 },
    });
    this.buttons = (Object.keys(PORTAL_ACTIONS) as PortalAction[]).map(
      (action) =>
        new Button({
          label: PORTAL_ACTIONS[action],
          name: action,
          style: { minWidth: 200 },
          onClick: () => this.act(action),
        })
    );
    this.node = new Stack({
      gap: 'xl',
      style: { padding: 32 },
      children: [
        new Label({
          text: 'Portal',
          name: 'title',
          style: { color: 'onSurface', fontSize: 40, fontWeight: 'bold' },
        }),
        this.status,
        new Stack({ direction: 'row', gap: 'l', children: this.buttons }),
      ],
    }).node;
    this.refresh();
  }

  /** Reads the portal again. The assistant calls it each time it opens. */
  refresh(): void {
    const portal = this.findPortal();
    this.status.text = portal
      ? `${portal.name} is ${portal.locked ? 'locked' : 'unlocked'}.`
      : 'There is no portal in this level.';
    for (const button of this.buttons)
      button.node.style.display = portal ? 'flex' : 'none';
  }

  private act(action: PortalAction): void {
    this.findPortal()?.doAction(action);
    this.refresh();
  }
}
