import {
  ITemplateTreeNode,
  IProject,
  ITreeNode,
  PropertyType,
  PropValue,
} from 'models';
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
              value: project.sceneGraph?.atmosphere?.cloudiness || 0.7,
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
              value: project.sceneGraph?.atmosphere?.foginess || 0.3,
              valueOptions: {
                min: 0,
                max: 1,
                step: 0.01,
                precision: 2,
              },
            },
            {
              label: 'Windiness',
              type: 'windiness',
              valueType: 'float',
              value: project.sceneGraph?.atmosphere?.windiness || 0.5,
              valueOptions: {
                min: 0,
                max: 1,
                step: 0.01,
                precision: 2,
              },
            },
            {
              label: 'Sun Elevation',
              type: 'elevation',
              valueType: 'float',
              value: project.sceneGraph?.atmosphere?.elevation || 80,
              valueOptions: {
                min: -360,
                max: 360,
                step: 1,
                precision: 2,
              },
            },
            {
              label: 'Day Night Cycle',
              type: 'dayNightCycle',
              valueType: 'boolean',
              value: project.sceneGraph?.atmosphere?.dayNightCycle || false,
            },
          ],
        },
      } as ITreeNode,
    ];
  }

  findNodeById(
    id: string,
    nodes: ITreeNode[] | null = this._defaultProxy.nodes
  ): ITreeNode | null {
    if (!nodes) return null;

    for (const node of nodes) {
      if (node.resource?.id === id) {
        return node;
      }

      if (node.children) {
        const found = this.findNodeById(id, node.children);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  buildObjectFromProperties(id: string) {
    const node = this.findNodeById(id);
    if (!node) {
      return null;
    }

    const obj = node.resource?.properties.reduce((acc, cur) => {
      acc[cur.type] = cur.value;
      return acc;
    }, {} as { [key in PropertyType]: PropValue });

    return obj;
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
