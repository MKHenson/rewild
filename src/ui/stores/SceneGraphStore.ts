import { ITemplateTreeNode, IProject, ITreeNode } from 'models';
import { traverseTree, Store } from 'rewild-ui';
import { containerFactory } from '../utils/TemplateFactories';

export interface ISceneGraphStore {
  nodes: ITreeNode[];
}

export class SceneGraphStore extends Store<ISceneGraphStore> {
  constructor() {
    super({
      nodes: [],
    });
  }

  buildTree(project: IProject) {
    this.defaultProxy.nodes = [
      {
        name: 'Containers',
        factoryKey: 'container',
        canSelect: true,
        icon: 'group_work',
        id: 'CONTAINERS',
        template: containerFactory,
        children:
          project.sceneGraph?.containers.map((node) => ({
            ...containerFactory(),
            ...node,
          })) || [],
      } as ITemplateTreeNode,
      {
        name: 'Sky',
        factoryKey: 'sky',
        canRename: false,
        canSelect: true,
        icon: 'wb_sunny',
        id: 'SKY',
        resource: {
          id: 'SKY',
          name: 'Sky',
          type: 'actor',
          properties: [
            {
              label: 'Cloudiness',
              type: 'cloudiness',
              valueType: 'float',
              value: 0.7,
              valueOptions: {
                min: 0,
                max: 1,
                step: 0.01,
                precision: 2,
              },
            },
            {
              label: 'Foginess',
              type: 'foginess',
              valueType: 'float',
              value: 0.3,
              valueOptions: {
                min: 0,
                max: 1,
                step: 0.01,
                precision: 2,
              },
            },
            {
              label: 'Sun Elevation',
              type: 'sun_elevation',
              valueType: 'float',
              value: 0,
              valueOptions: {
                min: -360,
                max: 360,
                step: 1,
                precision: 2,
              },
            },
            {
              label: 'Day Night Cycle',
              type: 'day_night_cycle',
              valueType: 'boolean',
              value: false,
            },
          ],
        },
      } as ITreeNode,
    ];
  }

  removeNode = (node: ITreeNode) => {
    traverseTree(this.defaultProxy.nodes, (n, parent) => {
      if (n === node) {
        parent!.children = parent!.children!.filter((child) => child !== node);
        return true;
      }

      return false;
    });
  };

  createChildNode(selectedNode: ITemplateTreeNode) {
    const newNode = selectedNode.template();
    selectedNode.children = (selectedNode.children || []).concat(newNode);
  }
}

export const sceneGraphStore = new SceneGraphStore();
