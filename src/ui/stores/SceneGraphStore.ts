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
import { Dispatcher } from 'rewild-common';
import { projectStore } from './ProjectStore';

export interface ISceneGraphStore {
  selectedContainerId: string | null;
  selectedResource: IResource | null;
}

export type SceneGraphEvents = {
  kind: 'nodes-updated';
  nodes: ITreeNode<IResource>[];
};

export class SceneGraphStore extends Store<ISceneGraphStore> {
  nodes: ITreeNode<IResource>[];
  dispatcher: Dispatcher<SceneGraphEvents>;

  constructor() {
    super({
      selectedContainerId: null,
      selectedResource: null,
    });

    this.dispatcher = new Dispatcher();
    this.dispatcher.add(this.handleSceneGraphEvent);
    this.nodes = [];
  }

  handleSceneGraphEvent(event: SceneGraphEvents) {
    if (event.kind === 'nodes-updated') {
      projectStore.defaultProxy.dirty = true;
    }
  }

  buildTreeFromProject(project: IProject) {
    this.nodes = [
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

    this.dispatcher.dispatch({ kind: 'nodes-updated', nodes: this.nodes });
  }

  findNodeById(
    id: string,
    nodes: ITreeNode<IResource>[] | null = this.nodes
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
    traverseTree(this.nodes, (n, parent) => {
      if (n === node) {
        parent!.children = parent!.children!.filter((child) => child !== node);
        return true;
      }

      return false;
    });

    this.dispatcher.dispatch({ kind: 'nodes-updated', nodes: this.nodes });
  };

  createChildNode(selectedNode: ITemplateTreeNode) {
    const newNode = selectedNode.template();
    selectedNode.children = (selectedNode.children || []).concat(newNode);
    this.dispatcher.dispatch({ kind: 'nodes-updated', nodes: this.nodes });
  }

  addNode(
    node: ITreeNode<IResource>,
    parent?: ITreeNode<IResource> | null
  ): ITreeNode<IResource> {
    if (parent && !parent.children) parent.children = [];

    let nodes = parent?.children || this.nodes;

    nodes.push(node);
    this.dispatcher.dispatch({ kind: 'nodes-updated', nodes: this.nodes });
    return node;
  }
}

export const sceneGraphStore = new SceneGraphStore();
