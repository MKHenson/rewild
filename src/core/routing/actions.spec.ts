import { Container, Level } from 'rewild-routing';
import { Asset3D } from 'rewild-routing/lib/testUtils';
import { PortalAsset } from './PortalAsset';
import { PORTAL_ACTIONS, actionsOf, doAssetAction } from './actions';

/** A portal with no renderer: only its lock and its actions. */
function portal(locked: boolean): PortalAsset {
  return Object.assign(Object.create(PortalAsset.prototype), { locked });
}

/** A test asset of `type` that records the actions it is told to do. */
function target(id: string, type: string) {
  const asset = new Asset3D(id, id);
  asset.data = { id, name: id, type };
  const done: string[] = [];
  (asset as any).doAction = (action: string) => done.push(action);
  return { asset, done };
}

function levelWith(...assets: Asset3D[]): Level {
  const level = new Level('Test', new Asset3D('Root', 'root'));
  const container = new Container('Inactive', false, new Asset3D('C', 'c'));
  for (const asset of assets) container.addAsset(asset);
  level.addChild(container);
  return level;
}

describe('PortalAsset.doAction', () => {
  it('unlocks, locks and toggles', () => {
    const asset = portal(true);
    asset.doAction('unlock');
    expect(asset.locked).toBe(false);
    asset.doAction('lock');
    expect(asset.locked).toBe(true);
    asset.doAction('toggle');
    expect(asset.locked).toBe(false);
    asset.doAction('toggle');
    expect(asset.locked).toBe(true);
  });
});

describe('actionsOf', () => {
  it('gives the portal its actions and other types none', () => {
    expect(actionsOf({ id: 'p', name: 'p', type: 'portal' })).toBe(
      PORTAL_ACTIONS
    );
    expect(actionsOf({ id: 'a', name: 'a', type: 'actor' })).toBeNull();
    expect(actionsOf(undefined)).toBeNull();
  });
});

describe('doAssetAction', () => {
  it('tells a target in an inactive container to act', () => {
    const { asset, done } = target('portal-id', 'portal');
    const level = levelWith(asset);

    expect(doAssetAction(level, 'portal-id', 'unlock')).toBe(true);
    expect(done).toEqual(['unlock']);
  });

  it('refuses an action the type does not declare', () => {
    const { asset, done } = target('portal-id', 'portal');
    const level = levelWith(asset);

    expect(doAssetAction(level, 'portal-id', 'explode')).toBe(false);
    expect(doAssetAction(level, 'portal-id', 'toString')).toBe(false);
    expect(done).toEqual([]);
  });

  it('refuses a missing target and a type with no actions', () => {
    const { asset, done } = target('actor-id', 'actor');
    const level = levelWith(asset);

    expect(doAssetAction(level, 'missing', 'unlock')).toBe(false);
    expect(doAssetAction(level, 'actor-id', 'unlock')).toBe(false);
    expect(done).toEqual([]);
  });
});
