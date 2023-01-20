import { IEditorResource, IProject, ITreeNode } from "models";
import { createUUID } from "../../../../utils";
import { NodeDroppedDelegate } from "./SceneGraph";

export class SceneGraphFactory {
  private createContainer() {
    const newContainerNode: ITreeNode<IEditorResource> = {
      id: createUUID(),
      name: `New Container`,
      resource: {
        id: createUUID(),
        properties: [
          { name: "baseContainer", value: "", type: "string" },
          { name: "activeOnStartup", value: true, type: "boolean" },
        ],
        type: "container",
      },
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
        children: project.containers.map(
          (container) =>
            ({
              name: container.name,
              icon: "label",
              iconSize: "xs",
              canSelect: true,
              resource: container,
              canRename: true,
              id: container,
              children: container.actors.map((actor) => ({
                name: actor.name,
                id: actor.id,
                canSelect: true,
                resource: actor,
                children: [],
              })),
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
