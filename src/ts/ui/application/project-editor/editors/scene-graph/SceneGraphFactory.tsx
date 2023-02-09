import { IEditorResource, IProject, ITreeNode } from "models";
import { createUUID } from "../../../../utils";
import { NodeDroppedDelegate } from "./SceneGraph";

export class SceneGraphFactory {
  private createContainer() {
    const newContainerNode: ITreeNode = {
      id: createUUID(),
      name: `New Container`,
      icon: "label",
      iconSize: "xs",
      canSelect: true,
      canRename: true,
      resource: {
        id: createUUID(),
        properties: [
          { name: "baseContainer", value: "", type: "string" },
          { name: "activeOnStartup", value: true, type: "boolean" },
        ],
        type: "container",
      } as IEditorResource,
      children: [],
    };

    return newContainerNode;
  }

  buildTree(project: IProject, onNodeDropped: NodeDroppedDelegate) {
    return [
      {
        name: "Containers",
        canSelect: true,
        icon: "group_work",
        id: "CONTAINERS",
        children: project.sceneGraph.containers.map(
          (container) =>
            ({
              ...container,
              name: container.name,
              children: [],
              onDragOver(data, node) {
                return true;
              },
              onDrop: onNodeDropped,
            } as ITreeNode)
        ),
      } as ITreeNode,
    ];
  }

  createChildNode(selectedNode: ITreeNode) {
    if (selectedNode.name === "Containers") return this.createContainer();
    return null;
  }

  canDeleteNode(selectedNode: ITreeNode) {
    if (selectedNode.resource) return true;
    return false;
  }

  canCreateNode(selectedNode: ITreeNode) {
    if (selectedNode.name === "Containers") return true;
    return false;
  }
}
