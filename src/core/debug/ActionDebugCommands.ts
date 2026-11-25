import { IResource } from 'models';
import { Level } from 'rewild-routing';
import { Player } from '../routing/Player';
import { PortalAsset } from '../routing/PortalAsset';
import { actionsOf, doAssetAction } from '../routing/actions';

// Asset actions, from the console. A target is an asset's id
// or its name, in any container of the running level.
export function registerActionDebugCommands() {
  const level = (name: string): Level | null => {
    const found = Player.current?.stateMachine?.nodes.find(
      (node): node is Level => node instanceof Level
    );
    if (!found) console.log(`${name}() — no level in a game`);
    return found ?? null;
  };

  (window as any).listActionTargets = () => {
    const running = level('listActionTargets');
    if (!running) return;
    const rows = running
      .stateMachine!.getAllAssets(running)
      .flatMap((asset) => {
        const actions = actionsOf(asset.data as IResource | undefined);
        if (!actions) return [];
        return [
          {
            id: asset.id,
            name: asset.name,
            type: (asset.data as IResource).type,
            actions: Object.keys(actions).join(', '),
            locked: asset instanceof PortalAsset ? asset.locked : '-',
          },
        ];
      });
    console.table(rows);
  };

  (window as any).doAction = (target?: string, action?: string) => {
    const running = level('doAction');
    if (!running) return;
    if (!target || !action) {
      console.log(
        "doAction(target, action) — for example doAction('Portal', 'unlock'). " +
          'listActionTargets() lists the targets and their actions.'
      );
      return;
    }
    const byName = running
      .stateMachine!.getAllAssets(running)
      .find((asset) => asset.name === target);
    const id = running.findAssetById(target) ? target : byName?.id;
    if (!id || !doAssetAction(running, id, action)) {
      console.log(
        `doAction('${target}', '${action}') — no target with that id or ` +
          'name, or its type does not declare that action.'
      );
      return;
    }
    console.log(`doAction('${target}', '${action}') — done`);
  };
}
