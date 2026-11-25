import { IResource, ResourceType } from 'models';
import type { Level } from 'rewild-routing';

// What each asset type can be told to do, with the label the editor shows.
export const PORTAL_ACTIONS = {
  unlock: 'Unlock',
  lock: 'Lock',
  toggle: 'Toggle',
} as const;

export type PortalAction = keyof typeof PORTAL_ACTIONS;

export const assetActions: Partial<
  Record<ResourceType, Record<string, string>>
> = {
  portal: PORTAL_ACTIONS,
};

/** An asset that does the actions its type declares in `assetActions`. */
export interface IActionTarget {
  doAction(action: string): void;
}

/** The actions an asset's type declares, or null when it has none. */
export function actionsOf(
  resource: IResource | undefined
): Record<string, string> | null {
  return (resource && assetActions[resource.type]) ?? null;
}

/**
 * Tells the asset with `targetId`, in any container of `level`, to do
 * `action`. False when there is no such asset, or its type does not declare
 * the action.
 */
export function doAssetAction(
  level: Level,
  targetId: string,
  action: string
): boolean {
  const asset = level.findAssetById(targetId);
  const actions = actionsOf(asset?.data as IResource | undefined);
  if (!actions || !Object.prototype.hasOwnProperty.call(actions, action))
    return false;
  (asset as unknown as IActionTarget).doAction(action);
  return true;
}
