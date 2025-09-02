import {
  ITemplateTreeNode,
  IProject,
  PropertyType,
  PropValue,
  IResource,
} from 'models';
import { traverseTree, Store, ITreeNode } from 'rewild-ui';
import {
  containerFactory,
  baseActorTemplate,
} from '../utils/TemplateFactories';

export interface ISceneGraphStore {
  nodes: ITreeNode<IResource>[];
  selectedContainerId: string | null;
}

export class SceneGraphStore extends Store<ISceneGraphStore> {
  constructor() {
    super({
      nodes: [],
      selectedContainerId: null,
    });
  }

  buildTreeFromProject(project: IProject) {
    this.defaultProxy.nodes = [
      {
        name: 'Containers',
        factoryKey: 'container',
        canSelect: true,
        icon: 'group_work',
        id: 'CONTAINERS',
        template: containerFactory,
        children:
          project.sceneGraph?.containers.map(
            (node) =>
              ({
                ...containerFactory(),
                name: node.name,
                resource: node,
                children: node.actors?.map(
                  (actor) =>
                    ({
                      ...baseActorTemplate,
                      icon: 'label_important',
                      name: actor.name,
                      resource: actor,
                    } as ITreeNode)
                ),
              } as ITreeNode)
          ) || [],
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
              type: 'cloudiness',
              value: project.sceneGraph?.atmosphere?.cloudiness || 0.7,
            },
            {
              type: 'foginess',
              value: project.sceneGraph?.atmosphere?.foginess || 0.3,
            },
            {
              type: 'windiness',
              value: project.sceneGraph?.atmosphere?.windiness || 0.5,
            },
            {
              type: 'elevation',
              value: project.sceneGraph?.atmosphere?.elevation || 80,
            },
            {
              type: 'dayNightCycle',
              value: project.sceneGraph?.atmosphere?.dayNightCycle || false,
            },
          ],
        },
      } as ITreeNode<IResource>,
    ];
  }

  findNodeById(
    id: string,
    nodes: ITreeNode<IResource>[] | null = this._defaultProxy.nodes
  ): ITreeNode<IResource> | null {
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

  getNodePropertyValue(
    node: ITreeNode<IResource>,
    propertyType: PropertyType
  ): PropValue | null {
    const property = node.resource?.properties.find(
      (prop) => prop.type === propertyType
    );
    return property ? property.value : null;
  }

  removeNode = (node: ITreeNode<IResource>) => {
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
