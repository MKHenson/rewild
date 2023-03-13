import { ITemplateTreeNode, IProject, ITreeNode } from "models";
import { traverseTree } from "../common/Tree";
import { Store } from "../Store";
import { createUUID } from "../utils";

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
        canSelect: true,
        icon: "group_work",
        id: "CONTAINERS",
        template: () => ({
          canRename: true,
          canSelect: true,
          icon: "label",
          iconSize: "xs",
          resource: {
            target: { type: "container", id: createUUID(), name: "New Container" },
            properties: [
              {
                name: "Base Container",
                type: "string",
                value: "",
              },
              {
                name: "Active On Startup",
                type: "boolean",
                value: true,
              },
            ],
          },
        }),
        children: project.sceneGraph?.containers || [],
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
