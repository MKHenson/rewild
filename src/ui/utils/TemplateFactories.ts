import { ITreeNode, ITreeNodeAction } from "models";
import { createUUID } from "rewild-ui";

export const baseActorTemplate: ITreeNode = {
  canRename: true,
  canSelect: true,
  iconSize: "xs",
};

export const containerFactory: () => ITreeNode = () => ({
  ...baseActorTemplate,
  icon: "label",
  onDragOver(data, node) {
    if (data?.type === "treenode" && (data as ITreeNodeAction).node) return true;
    return false;
  },
  onDrop(data, node) {
    return true;
  },
  resource: {
    type: "container",
    id: createUUID(),
    name: "New Container",
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
});
