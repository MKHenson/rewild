import { IActor, IProperty, ITreeNode, ITreeNodeAction } from "models";
import { createUUID } from "rewild-ui";

const baseActorTemplate: ITreeNode = {
  canRename: true,
  canSelect: true,
  iconSize: "xs",
};

const baseActorProperties: IProperty[] = [
  {
    name: "Size",
    type: "string",
    value: "1",
  },
];

export const actorFactory: () => ITreeNode = () => ({
  ...baseActorTemplate,
  icon: "label_important",
  resource: {
    properties: [...baseActorProperties],
    name: "Earth",
    type: "actor",
    id: createUUID(),
    baseType: "static",
    geometry: "sphere",
    pipeline: "earth",
  } as IActor,
});

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
