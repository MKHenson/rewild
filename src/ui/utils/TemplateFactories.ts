import { IResource, ITreeNodeAction } from 'models';
import { createUUID, ITreeNode } from 'rewild-ui';

export const baseActorTemplate: ITreeNode = {
  canRename: true,
  canSelect: true,
  iconSize: 'xs',
};

export const containerFactory: () => ITreeNode<IResource> = () => ({
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
        label: 'Active On Startup',
        type: 'active',
        valueType: 'boolean',
        value: true,
      },
    ],
  },
});
