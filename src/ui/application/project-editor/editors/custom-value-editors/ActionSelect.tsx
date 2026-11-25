import { IResource, PropValueObject } from 'models';
import { Component, register, Select, theme, traverseTree } from 'rewild-ui';
import { sceneGraphStore } from 'src/ui/stores/SceneGraphStore';
import { actionsOf } from 'src/core/routing/actions';

/** What an `action` property holds: the target asset's id and its action. */
export type ActionValue = { target: string; action: string };

interface Props {
  readOnly?: boolean;
  value?: PropValueObject;
  onChange?: (value: ActionValue) => void;
}

type Target = { resource: IResource; label: string };

/** Each asset in the level with actions, in any container, labelled with its container. */
function actionTargets(): Target[] {
  const targets: Target[] = [];
  traverseTree(sceneGraphStore.nodes, (node, parent) => {
    const resource = node.resource as IResource | undefined;
    if (resource && actionsOf(resource)) {
      const container = parent?.resource ? ` (${parent.resource.name})` : '';
      targets.push({ resource, label: `${resource.name}${container}` });
    }
    return false;
  });
  return targets;
}

/** Why the value cannot run, or null when it is empty or complete. */
export function actionError(
  value: ActionValue,
  targets: Target[]
): string | null {
  if (!value.target) return null;
  const target = targets.find((t) => t.resource.id === value.target);
  if (!target) return 'The target is not in the level';
  if (!value.action) return 'Choose an action';
  const actions = actionsOf(target.resource)!;
  if (!Object.prototype.hasOwnProperty.call(actions, value.action))
    return 'The target cannot do this action';
  return null;
}

/**
 * Picks an asset in the level and one of its actions. The action list is
 * empty until a target is chosen, and it clears when the target changes.
 */
@register('x-action-select')
export class ActionSelect extends Component<Props> {
  init() {
    this.on(sceneGraphStore.dispatcher);

    return () => {
      const value: ActionValue = {
        target: (this.props.value?.target as string) || '',
        action: (this.props.value?.action as string) || '',
      };
      const targets = actionTargets();
      const target = targets.find((t) => t.resource.id === value.target);
      const actions = target ? actionsOf(target.resource)! : {};
      const error = actionError(value, targets);

      return (
        <div class="action-select">
          <Select
            options={[
              { value: '', label: 'None' },
              ...targets.map((t) => ({
                value: t.resource.id,
                label: t.label,
              })),
            ]}
            value={value.target}
            disabled={this.props.readOnly}
            onChange={(id) =>
              this.props.onChange?.({ target: id as string, action: '' })
            }
          />
          <Select
            options={[
              { value: '', label: 'None' },
              ...Object.entries(actions).map(([action, label]) => ({
                value: action,
                label,
              })),
            ]}
            value={value.action}
            disabled={this.props.readOnly || !target}
            onChange={(action) =>
              this.props.onChange?.({
                target: value.target,
                action: action as string,
              })
            }
          />
          {error && <p class="action-error">{error}</p>}
        </div>
      );
    };
  }

  getStyle() {
    return StyledActionSelect;
  }
}

const StyledActionSelect = cssStylesheet(css`
  .action-select {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .action-error {
    color: ${theme.colors.error400};
    font-size: ${theme.colors.fontSizeSmall};
    margin: 0;
  }
`);
