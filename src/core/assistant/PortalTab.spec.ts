import { PortalAction } from '../routing/actions';
import { PortalTab, PortalTarget } from './PortalTab';

function portal(locked: boolean): PortalTarget & { done: PortalAction[] } {
  const done: PortalAction[] = [];
  return {
    name: 'Summit Portal',
    locked,
    done,
    doAction(action: PortalAction) {
      done.push(action);
      if (action === 'unlock') this.locked = false;
      else if (action === 'lock') this.locked = true;
      else this.locked = !this.locked;
    },
  };
}

describe('PortalTab', () => {
  it("has a button for each of the portal's actions", () => {
    const tab = new PortalTab(() => portal(true));
    expect(tab.buttons.map((button) => button.text)).toEqual([
      'Unlock',
      'Lock',
      'Toggle',
    ]);
  });

  it('says whether the portal is locked', () => {
    expect(new PortalTab(() => portal(true)).status.text).toBe(
      'Summit Portal is locked.'
    );
    expect(new PortalTab(() => portal(false)).status.text).toBe(
      'Summit Portal is unlocked.'
    );
  });

  it('tells the portal to act, and shows its new state', () => {
    const target = portal(true);
    const tab = new PortalTab(() => target);
    tab.buttons[0].onClick!();
    expect(target.done).toEqual(['unlock']);
    expect(tab.status.text).toBe('Summit Portal is unlocked.');
  });

  it('shows no buttons with no portal in the level', () => {
    const tab = new PortalTab(() => null);
    expect(tab.status.text).toBe('There is no portal in this level.');
    for (const button of tab.buttons)
      expect(button.node.style.display).toBe('none');
  });

  it('reads the portal again on refresh', () => {
    let target: PortalTarget | null = null;
    const tab = new PortalTab(() => target);
    target = portal(true);
    tab.refresh();
    expect(tab.status.text).toBe('Summit Portal is locked.');
    for (const button of tab.buttons)
      expect(button.node.style.display).toBe('flex');
  });
});
