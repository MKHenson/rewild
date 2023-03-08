import { IContainer, IProject, IResource } from "models";
import { ITreeNode } from "../../../../ui/common/Tree";
import { createUUID } from "../../../utils";

export class SceneGraphFactory {
  private createContainer() {
    const newContainer: IContainer = {
      id: createUUID(),
      name: `New Container`,
      baseContainer: "",
      activeOnStartup: true,
      type: "container",
      actors: [],
    };

    return newContainer;
  }

  buildTree(project: IProject) {
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
              children: [],
            } as ITreeNode)
        ),
      } as ITreeNode,
    ];
  }

  createChildNode(selectedNode: ITreeNode): IResource | null {
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
