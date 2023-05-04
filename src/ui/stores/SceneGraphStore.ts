import { ITemplateTreeNode, IProject, ITreeNode } from "models";
import { traverseTree, Store } from "rewild-ui";
import { containerFactory } from "../utils/TemplateFactories";

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
        name: "Containers",
        factoryKey: "container",
        canSelect: true,
        icon: "group_work",
        id: "CONTAINERS",
        template: containerFactory,
        children: project.sceneGraph?.containers.map((node) => ({ ...containerFactory(), ...node })) || [],
      } as ITemplateTreeNode,
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
