import { ITreeNode, ITreeNodeAction } from 'models';
import { createUUID } from 'rewild-ui';

export const baseActorTemplate: ITreeNode = {
  canRename: true,
  canSelect: true,
  iconSize: 'xs',
};

export const containerFactory: () => ITreeNode = () => ({
  ...baseActorTemplate,
  icon: 'label',
  onDragOver(data, node) {
    if (data?.type === 'treenode' && (data as ITreeNodeAction).node)
      return true;
    return false;
  },
  onDrop(data, node) {
    return true;
  },
  resource: {
    type: 'container',
    id: createUUID(),
    name: 'New Container',
    properties: [
      {
        label: 'Base Container',
        type: 'baseContainer',
        valueType: 'string',
        value: '',
      },
      {
        label: 'Active On Startup',
        type: 'active',
        valueType: 'boolean',
        value: true,
      },
    ],
  },
});
